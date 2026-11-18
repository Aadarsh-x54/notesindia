package com.notesindia;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notesindia.admin.AdminService;
import com.notesindia.note.NoteRepository;
import com.notesindia.note.NoteStatus;
import com.notesindia.user.Role;
import com.notesindia.user.User;
import com.notesindia.user.UserRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PadhakuAiIntegrationTest {

    private static final String INTERNAL_KEY = "test-java-python-secret-key-2026";

    private static HttpServer mockAiServer;
    private static final List<String> receivedAuthHeaders = new CopyOnWriteArrayList<>();
    private static final List<String> ingestedNoteIds = new CopyOnWriteArrayList<>();
    private static final List<String> deletedNoteIds = new CopyOnWriteArrayList<>();
    private static final List<JsonNode> chatRequests = new CopyOnWriteArrayList<>();
    private static final AtomicBoolean simulateAiError = new AtomicBoolean(false);
    private static final AtomicReference<String> injectedUnauthorizedNoteId = new AtomicReference<>(null);
    private static final ObjectMapper STATIC_MAPPER = new ObjectMapper();

    @Autowired private TestRestTemplate restTemplate;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private NoteRepository noteRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private AdminService adminService;
    @Autowired private PasswordEncoder passwordEncoder;

    @BeforeAll
    static void startMockAiServer() throws IOException {
        mockAiServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);

        mockAiServer.createContext("/health", exchange -> {
            recordKey(exchange);
            String body = """
                    {
                      "status": "ok",
                      "llm_provider": "ollama",
                      "active_model": "qwen2.5:1.5b",
                      "ollama_available": true,
                      "model_available": true,
                      "vector_store": "faiss",
                      "embedding_backend": "transformers",
                      "indexed_chunks": 12,
                      "message": "Padhaku AI ready with qwen2.5:1.5b"
                    }
                    """;
            sendJson(exchange, 200, body);
        });

        mockAiServer.createContext("/api/ai/ingest", exchange -> {
            if (!checkInternalKey(exchange)) return;
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            if ("DELETE".equalsIgnoreCase(method)) {
                String id = path.substring(path.lastIndexOf('/') + 1);
                deletedNoteIds.add(id);
                sendJson(exchange, 200, "{\"success\":true,\"note_id\":\"" + id + "\"}");
                return;
            }
            String bodyText = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            // Extract note_id field from multipart payload
            int marker = bodyText.indexOf("name=\"note_id\"");
            String noteId = "unknown";
            if (marker >= 0) {
                int start = bodyText.indexOf("\r\n\r\n", marker);
                if (start >= 0) {
                    int end = bodyText.indexOf("\r\n", start + 4);
                    noteId = (end > start ? bodyText.substring(start + 4, end) : bodyText.substring(start + 4)).trim();
                }
            }
            ingestedNoteIds.add(noteId);
            sendJson(exchange, 200, "{\"success\":true,\"note_id\":\"" + noteId + "\",\"chunks_indexed\":3,\"char_count\":500,\"page_count\":2}");
        });

        mockAiServer.createContext("/api/ai/chat/stream", exchange -> {
            if (!checkInternalKey(exchange)) return;
            if (simulateAiError.get()) {
                sendJson(exchange, 503, "{\"detail\":\"Simulated AI failure\"}");
                return;
            }
            byte[] reqBytes = exchange.getRequestBody().readAllBytes();
            JsonNode reqJson = STATIC_MAPPER.readTree(reqBytes);
            chatRequests.add(reqJson);

            List<Map<String, Object>> refs = buildStubReferences(reqJson);
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream; charset=utf-8");
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream os = exchange.getResponseBody()) {
                String refEvent = "data: " + STATIC_MAPPER.writeValueAsString(
                        Map.of("type", "references", "referenced_notes", refs)
                ) + "\n\n";
                os.write(refEvent.getBytes(StandardCharsets.UTF_8));
                os.flush();

                for (String tok : List.of("Article 44 ", "covers the ", "Uniform Civil Code ", "[Page 2].")) {
                    String tokEvent = "data: " + STATIC_MAPPER.writeValueAsString(
                            Map.of("type", "token", "token", tok)
                    ) + "\n\n";
                    os.write(tokEvent.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }

                String doneEvent = "data: " + STATIC_MAPPER.writeValueAsString(
                        Map.of("type", "done", "model_used", "qwen2.5:1.5b")
                ) + "\n\n";
                os.write(doneEvent.getBytes(StandardCharsets.UTF_8));
                os.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
        });

        mockAiServer.createContext("/api/ai/chat", exchange -> {
            if (!checkInternalKey(exchange)) return;
            if (simulateAiError.get()) {
                sendJson(exchange, 503, "{\"detail\":\"Simulated AI failure\"}");
                return;
            }
            byte[] reqBytes = exchange.getRequestBody().readAllBytes();
            JsonNode reqJson = STATIC_MAPPER.readTree(reqBytes);
            chatRequests.add(reqJson);

            List<Map<String, Object>> refs = buildStubReferences(reqJson);
            String reply = STATIC_MAPPER.writeValueAsString(Map.of(
                    "answer", "Grounded answer from uploaded PDF [Page 2]: Article 44 directs the Uniform Civil Code.",
                    "referenced_notes", refs,
                    "model_used", "qwen2.5:1.5b"
            ));
            sendJson(exchange, 200, reply);
        });

        mockAiServer.start();
    }

    @AfterAll
    static void stopMockAiServer() {
        if (mockAiServer != null) {
            mockAiServer.stop(0);
        }
    }

    @DynamicPropertySource
    static void registerAiProps(DynamicPropertyRegistry registry) {
        registry.add("notesindia.ai.base-url", () -> "http://127.0.0.1:" + mockAiServer.getAddress().getPort());
        registry.add("notesindia.ai.api-key", () -> INTERNAL_KEY);
        registry.add("notesindia.ai.timeout-seconds", () -> "15");
    }

    @BeforeEach
    void resetStubState() {
        simulateAiError.set(false);
        injectedUnauthorizedNoteId.set(null);
    }

    private static List<Map<String, Object>> buildStubReferences(JsonNode reqJson) {
        List<Map<String, Object>> refs = new ArrayList<>();
        JsonNode allowed = reqJson.path("allowed_note_ids");
        if (allowed.isArray() && !allowed.isEmpty()) {
            refs.add(Map.of(
                    "note_id", allowed.get(0).asText(),
                    "title", "Indian Polity Study Notes",
                    "score", 0.89,
                    "snippet", "Article 44 directs the State to secure a Uniform Civil Code.",
                    "categories", List.of("UPSC", "Polity"),
                    "page_numbers", List.of(2)
            ));
        }
        String unauthorizedId = injectedUnauthorizedNoteId.get();
        if (unauthorizedId != null) {
            refs.add(Map.of(
                    "note_id", unauthorizedId,
                    "title", "Restricted Leaked Note",
                    "score", 0.99,
                    "snippet", "Should be stripped by Java permission filter",
                    "categories", List.of("Restricted"),
                    "page_numbers", List.of(1)
            ));
        }
        return refs;
    }

    private static void recordKey(HttpExchange exchange) {
        String key = exchange.getRequestHeaders().getFirst("X-AI-Service-Key");
        if (key != null) receivedAuthHeaders.add(key);
    }

    private static boolean checkInternalKey(HttpExchange exchange) throws IOException {
        String key = exchange.getRequestHeaders().getFirst("X-AI-Service-Key");
        if (key != null) receivedAuthHeaders.add(key);
        if (!INTERNAL_KEY.equals(key)) {
            sendJson(exchange, 401, "{\"detail\":\"Invalid internal key\"}");
            return false;
        }
        return true;
    }

    private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String registerAndGetToken(String username, String email) throws Exception {
        Map<String, String> body = Map.of(
                "username", username,
                "email", email,
                "password", "SecurePass@123",
                "fullName", username + " User",
                "institution", "IIT Test"
        );
        ResponseEntity<String> res = restTemplate.postForEntity("/api/auth/register", body, String.class);
        assertEquals(HttpStatus.CREATED, res.getStatusCode(), "Register failed: " + res.getBody());
        return objectMapper.readTree(res.getBody()).path("data").path("accessToken").asText();
    }

    private HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private UUID uploadSamplePdf(String token, String title, String uniqueTag) throws Exception {
        byte[] pdfBytes = ("%PDF-1.4\n% Sample educational PDF " + uniqueTag + "\n%%EOF\n")
                .getBytes(StandardCharsets.UTF_8);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource(pdfBytes) {
            @Override
            public String getFilename() {
                return uniqueTag + ".pdf";
            }
        });
        form.add("title", title);
        form.add("description", "Educational PDF notes for automated Padhaku AI verification " + uniqueTag);
        form.add("newCategories", "[{\"name\":\"Polity\"}]");

        ResponseEntity<String> res = restTemplate.exchange(
                "/api/notes",
                HttpMethod.POST,
                new HttpEntity<>(form, headers),
                String.class
        );
        assertEquals(HttpStatus.CREATED, res.getStatusCode(), "PDF upload failed: " + res.getBody());
        String idStr = objectMapper.readTree(res.getBody()).path("data").path("id").asText();
        return UUID.fromString(idStr);
    }

    @Test
    @Order(1)
    void healthCheckAndInternalServiceKeyVerification() throws Exception {
        ResponseEntity<String> res = restTemplate.getForEntity("/api/ai/status", String.class);
        assertEquals(HttpStatus.OK, res.getStatusCode());
        JsonNode data = objectMapper.readTree(res.getBody()).path("data");
        assertTrue(data.path("available").asBoolean());
        assertEquals("qwen2.5:1.5b", data.path("activeModel").asText());
        assertEquals("faiss", data.path("vectorStore").asText());
        assertTrue(receivedAuthHeaders.contains(INTERNAL_KEY), "Java must authenticate to Python with X-AI-Service-Key");
    }

    @Test
    @Order(2)
    void unauthorizedRequestsAreBlockedWith401() {
        ResponseEntity<String> convList = restTemplate.getForEntity("/api/ai/conversations", String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, convList.getStatusCode());

        ResponseEntity<String> createConv = restTemplate.postForEntity("/api/ai/conversations", Map.of(), String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, createConv.getStatusCode());
    }

    @Test
    @Order(3)
    void pdfUploadTriggersAiIndexingAfterCommitAndRagChatPersistsHistory() throws Exception {
        String tokenA = registerAndGetToken("student_rag_a", "rag_a@notesindia.in");
        String tokenB = registerAndGetToken("student_rag_b", "rag_b@notesindia.in");

        UUID noteId = uploadSamplePdf(tokenA, "Indian Polity Study Notes", "polity-upload-1");

        // Wait briefly for @Async afterCommit indexing to hit the mock AI server
        long deadline = System.currentTimeMillis() + 5000;
        while (!ingestedNoteIds.contains(noteId.toString()) && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
        }
        assertTrue(ingestedNoteIds.contains(noteId.toString()), "Uploaded PDF should be indexed in Python AI service");

        // Create conversation focused on the uploaded note
        ResponseEntity<String> createRes = restTemplate.exchange(
                "/api/ai/conversations",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("title", "Polity Study", "focusedNoteId", noteId.toString()), authHeaders(tokenA)),
                String.class
        );
        assertEquals(HttpStatus.CREATED, createRes.getStatusCode());
        String convId = objectMapper.readTree(createRes.getBody()).path("data").path("id").asText();

        // Turn 1: Send chat message
        chatRequests.clear();
        ResponseEntity<String> msg1 = restTemplate.exchange(
                "/api/ai/conversations/" + convId + "/messages",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "Which article covers the Uniform Civil Code?", "mode", "GENERAL"), authHeaders(tokenA)),
                String.class
        );
        assertEquals(HttpStatus.OK, msg1.getStatusCode());
        JsonNode msg1Data = objectMapper.readTree(msg1.getBody()).path("data");
        assertTrue(msg1Data.path("content").asText().contains("Article 44"));
        assertEquals("qwen2.5:1.5b", msg1Data.path("modelUsed").asText());
        assertEquals(2, msg1Data.path("referencedNotes").get(0).path("pageNumbers").get(0).asInt());

        // Turn 2: Verify conversation history is sent to Python
        ResponseEntity<String> msg2 = restTemplate.exchange(
                "/api/ai/conversations/" + convId + "/messages",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "Summarize that in one line.", "mode", "SUMMARY"), authHeaders(tokenA)),
                String.class
        );
        assertEquals(HttpStatus.OK, msg2.getStatusCode());
        JsonNode secondPayload = chatRequests.get(chatRequests.size() - 1);
        assertTrue(secondPayload.path("history").isArray());
        assertEquals(2, secondPayload.path("history").size(), "Turn 2 must include previous user + assistant turns");
        assertTrue(secondPayload.path("allowed_note_ids").isArray());

        // Verify full conversation history is persisted in DB
        ResponseEntity<String> detailRes = restTemplate.exchange(
                "/api/ai/conversations/" + convId,
                HttpMethod.GET,
                new HttpEntity<>(authHeaders(tokenA)),
                String.class
        );
        assertEquals(HttpStatus.OK, detailRes.getStatusCode());
        assertEquals(4, objectMapper.readTree(detailRes.getBody()).path("data").path("messages").size());

        // Verify User B CANNOT access or mutate User A's conversation
        ResponseEntity<String> otherUserGet = restTemplate.exchange(
                "/api/ai/conversations/" + convId,
                HttpMethod.GET,
                new HttpEntity<>(authHeaders(tokenB)),
                String.class
        );
        assertEquals(HttpStatus.NOT_FOUND, otherUserGet.getStatusCode());

        // Verify regenerate does NOT duplicate user prompt in history
        ResponseEntity<String> regenRes = restTemplate.exchange(
                "/api/ai/conversations/" + convId + "/regenerate",
                HttpMethod.POST,
                new HttpEntity<>(authHeaders(tokenA)),
                String.class
        );
        assertEquals(HttpStatus.OK, regenRes.getStatusCode());
        JsonNode regenPayload = chatRequests.get(chatRequests.size() - 1);
        assertEquals(2, regenPayload.path("history").size(), "Regenerate history must exclude the prompt being regenerated");
    }

    @Test
    @Order(4)
    void sseStreamingWorksAndPersistsAssistantMessage() throws Exception {
        String token = registerAndGetToken("student_sse", "sse@notesindia.in");
        UUID noteId = uploadSamplePdf(token, "SSE Physics Notes", "sse-physics-1");

        ResponseEntity<String> createRes = restTemplate.exchange(
                "/api/ai/conversations",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("focusedNoteId", noteId.toString()), authHeaders(token)),
                String.class
        );
        String convId = objectMapper.readTree(createRes.getBody()).path("data").path("id").asText();

        HttpHeaders sseHeaders = authHeaders(token);
        sseHeaders.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));

        ResponseEntity<String> streamRes = restTemplate.exchange(
                "/api/ai/conversations/" + convId + "/stream",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "Stream the answer about Article 44", "mode", "GENERAL"), sseHeaders),
                String.class
        );
        assertEquals(HttpStatus.OK, streamRes.getStatusCode());
        String body = streamRes.getBody();
        assertNotNull(body);
        assertTrue(body.contains("event:references"), "SSE stream must emit references event: " + body);
        assertTrue(body.contains("event:token"), "SSE stream must emit token events: " + body);
        assertTrue(body.contains("event:done"), "SSE stream must emit done event: " + body);
        assertTrue(body.contains("Uniform Civil Code"), "SSE stream must contain streamed answer text");

        // Verify streamed assistant message was persisted to DB
        ResponseEntity<String> convDetail = restTemplate.exchange(
                "/api/ai/conversations/" + convId,
                HttpMethod.GET,
                new HttpEntity<>(authHeaders(token)),
                String.class
        );
        JsonNode messages = objectMapper.readTree(convDetail.getBody()).path("data").path("messages");
        assertEquals(2, messages.size());
        assertEquals("ASSISTANT", messages.get(1).path("role").asText());
        assertTrue(messages.get(1).path("content").asText().contains("Uniform Civil Code"));
    }

    @Test
    @Order(5)
    void restrictedFlaggedAndRemovedNotesCannotBeAccessedOrLeakedThroughAi() throws Exception {
        String token = registerAndGetToken("student_sec", "sec@notesindia.in");
        UUID restrictedNoteId = uploadSamplePdf(token, "Restricted Confidential Note", "restricted-sec-1");

        // Create admin user to flag the note
        User admin = new User();
        admin.setUsername("sec_admin_tester");
        admin.setEmail("sec_admin@notesindia.in");
        admin.setPasswordHash(passwordEncoder.encode("AdminPass@123"));
        admin.setFullName("Sec Admin");
        admin.setRole(Role.ADMIN);
        admin.setActive(true);
        admin = userRepository.save(admin);

        // Flagging the note must restrict it AND remove it from AI vector index
        deletedNoteIds.clear();
        adminService.updateNoteStatus(restrictedNoteId, NoteStatus.FLAGGED, admin.getId());

        long deadline = System.currentTimeMillis() + 5000;
        while (!deletedNoteIds.contains(restrictedNoteId.toString()) && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
        }
        assertTrue(deletedNoteIds.contains(restrictedNoteId.toString()), "Flagged note must be removed from vector index");
        assertFalse(noteRepository.findById(restrictedNoteId).orElseThrow().isAiIndexed());

        // Attempting to create conversation focused on FLAGGED note -> 403 Forbidden
        ResponseEntity<String> blockedCreate = restTemplate.exchange(
                "/api/ai/conversations",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("focusedNoteId", restrictedNoteId.toString()), authHeaders(token)),
                String.class
        );
        assertEquals(HttpStatus.FORBIDDEN, blockedCreate.getStatusCode());

        // Even if a general chat runs AND Python hypothetically tries to return the restricted note_id,
        // Java (1) omits restrictedNoteId from allowed_note_ids AND (2) strips it from referenced_notes!
        ResponseEntity<String> convRes = restTemplate.exchange(
                "/api/ai/conversations",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("title", "General Check"), authHeaders(token)),
                String.class
        );
        String convId = objectMapper.readTree(convRes.getBody()).path("data").path("id").asText();

        injectedUnauthorizedNoteId.set(restrictedNoteId.toString());
        chatRequests.clear();
        ResponseEntity<String> chatRes = restTemplate.exchange(
                "/api/ai/conversations/" + convId + "/messages",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "Try to leak restricted note"), authHeaders(token)),
                String.class
        );
        assertEquals(HttpStatus.OK, chatRes.getStatusCode());

        // 1. Java must NOT include restrictedNoteId in allowed_note_ids sent to Python
        JsonNode sentPayload = chatRequests.get(chatRequests.size() - 1);
        List<String> sentAllowed = new ArrayList<>();
        sentPayload.path("allowed_note_ids").forEach(n -> sentAllowed.add(n.asText()));
        assertFalse(sentAllowed.contains(restrictedNoteId.toString()), "Restricted note must not be in allowed_note_ids");

        // 2. Java must strip any leaked unauthorized reference from response
        JsonNode returnedRefs = objectMapper.readTree(chatRes.getBody()).path("data").path("referencedNotes");
        for (JsonNode ref : returnedRefs) {
            assertNotEquals(restrictedNoteId.toString(), ref.path("noteId").asText());
        }
    }

    @Test
    @Order(6)
    void gracefulErrorHandlingWhenAiServiceFails() throws Exception {
        String token = registerAndGetToken("student_err", "err@notesindia.in");
        ResponseEntity<String> convRes = restTemplate.exchange(
                "/api/ai/conversations",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("title", "Error Handling Check"), authHeaders(token)),
                String.class
        );
        String convId = objectMapper.readTree(convRes.getBody()).path("data").path("id").asText();

        simulateAiError.set(true);
        ResponseEntity<String> msgRes = restTemplate.exchange(
                "/api/ai/conversations/" + convId + "/messages",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "What happens when AI service returns 503?"), authHeaders(token)),
                String.class
        );
        assertEquals(HttpStatus.OK, msgRes.getStatusCode());
        JsonNode data = objectMapper.readTree(msgRes.getBody()).path("data");
        assertEquals("offline-fallback", data.path("modelUsed").asText());
        assertTrue(data.path("content").asText().contains("Local LLM Notice"));
    }
}
