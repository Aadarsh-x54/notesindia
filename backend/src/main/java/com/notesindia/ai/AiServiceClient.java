package com.notesindia.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notesindia.note.Note;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.*;

@Component
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);
    private static final String API_KEY_HEADER = "X-AI-Service-Key";
    private static final ParameterizedTypeReference<ServerSentEvent<String>> SSE_TYPE =
            new ParameterizedTypeReference<>() {};

    private final WebClient webClient;
    private final String apiKey;
    private final Duration timeout;
    private final ObjectMapper objectMapper;

    public AiServiceClient(
            @Value("${notesindia.ai.base-url:http://localhost:8000}") String baseUrl,
            @Value("${notesindia.ai.api-key}") String apiKey,
            @Value("${notesindia.ai.timeout-seconds:180}") long timeoutSeconds,
            ObjectMapper objectMapper
    ) {
        this.apiKey = apiKey;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.objectMapper = objectMapper;
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .codecs(cfg -> cfg.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    public AiDtos.AiStatusResponse getStatus() {
        try {
            JsonNode node = webClient.get()
                    .uri("/health")
                    .header(API_KEY_HEADER, apiKey)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .timeout(Duration.ofSeconds(5))
                    .block();

            if (node != null) {
                boolean ollamaAvailable = node.path("ollama_available").asBoolean(false);
                boolean modelAvailable = node.has("model_available")
                        ? node.path("model_available").asBoolean(false)
                        : ollamaAvailable;
                boolean ready = "ok".equalsIgnoreCase(node.path("status").asText())
                        || (ollamaAvailable && modelAvailable);
                return new AiDtos.AiStatusResponse(
                        ready,
                        node.path("llm_provider").asText("ollama"),
                        node.path("active_model").asText("qwen2.5:1.5b"),
                        node.path("vector_store").asText("faiss"),
                        node.path("indexed_chunks").asLong(0),
                        node.path("message").asText("Padhaku AI service connected")
                );
            }
        } catch (Exception ex) {
            log.debug("Padhaku AI service unavailable: {}", ex.getMessage());
        }
        return new AiDtos.AiStatusResponse(
                false,
                "ollama",
                "offline",
                "faiss",
                0,
                "Padhaku AI Python service is not running. Start ai-service & Ollama to enable local LLM responses."
        );
    }

    public boolean ingestNote(Note note, byte[] fileBytes, List<String> categoryNames) {
        try {
            MultipartBodyBuilder builder = new MultipartBodyBuilder();
            builder.part("note_id", note.getId().toString());
            builder.part("title", note.getTitle());
            builder.part("description", note.getDescription());
            builder.part("categories", String.join(",", categoryNames));
            builder.part("file_format", note.getFileFormat());
            builder.part("file", new ByteArrayResource(fileBytes) {
                @Override
                public String getFilename() {
                    return note.getOriginalFilename();
                }
            }).contentType(MediaType.APPLICATION_OCTET_STREAM);

            JsonNode res = webClient.post()
                    .uri("/api/ai/ingest")
                    .header(API_KEY_HEADER, apiKey)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .timeout(timeout)
                    .block();

            return res != null && res.path("success").asBoolean(false);
        } catch (Exception ex) {
            log.warn("Failed to index note {} in Padhaku AI service: {}", note.getId(), ex.getMessage());
            return false;
        }
    }

    public void deleteNoteIndex(UUID noteId) {
        try {
            webClient.delete()
                    .uri("/api/ai/ingest/{noteId}", noteId.toString())
                    .header(API_KEY_HEADER, apiKey)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(Duration.ofSeconds(10))
                    .block();
        } catch (Exception ex) {
            log.debug("Failed to delete note {} from Padhaku AI index: {}", noteId, ex.getMessage());
        }
    }

    public AiDtos.ExtractedDocumentResponse extractAdHocDocument(String filename, byte[] bytes) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        }).contentType(MediaType.APPLICATION_OCTET_STREAM);

        JsonNode res = webClient.post()
                .uri("/api/ai/extract")
                .header(API_KEY_HEADER, apiKey)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(builder.build()))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .timeout(timeout)
                .block();

        if (res == null) {
            throw new IllegalStateException("Empty extraction response from AI service");
        }
        return new AiDtos.ExtractedDocumentResponse(
                res.path("filename").asText(filename),
                res.path("page_count").asInt(1),
                res.path("char_count").asInt(0),
                res.path("extracted_text").asText("")
        );
    }

    public AiChatResult chat(Map<String, Object> payload) {
        JsonNode res = webClient.post()
                .uri("/api/ai/chat")
                .header(API_KEY_HEADER, apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .timeout(timeout)
                .block();

        if (res == null) {
            throw new IllegalStateException("Empty chat response from AI service");
        }

        List<AiDtos.ReferencedNote> refs = parseReferences(res.path("referenced_notes"));
        return new AiChatResult(
                res.path("answer").asText(""),
                refs,
                res.path("model_used").asText("local-llm")
        );
    }

    public Flux<ServerSentEvent<String>> streamChat(Map<String, Object> payload) {
        return webClient.post()
                .uri("/api/ai/chat/stream")
                .header(API_KEY_HEADER, apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(payload)
                .retrieve()
                .bodyToFlux(SSE_TYPE)
                .timeout(timeout);
    }

    public List<AiDtos.ReferencedNote> parseReferences(JsonNode arrayNode) {
        List<AiDtos.ReferencedNote> list = new ArrayList<>();
        if (arrayNode != null && arrayNode.isArray()) {
            for (JsonNode item : arrayNode) {
                List<String> cats = new ArrayList<>();
                JsonNode catsNode = item.path("categories");
                if (catsNode.isArray()) {
                    catsNode.forEach(c -> cats.add(c.asText()));
                }
                List<Integer> pages = new ArrayList<>();
                JsonNode pagesNode = item.path("page_numbers");
                if (pagesNode.isArray()) {
                    pagesNode.forEach(p -> {
                        if (p.isInt()) pages.add(p.asInt());
                    });
                }
                list.add(new AiDtos.ReferencedNote(
                        item.path("note_id").asText(""),
                        item.path("title").asText("Untitled Note"),
                        item.path("score").asDouble(0.0),
                        item.path("snippet").asText(""),
                        cats,
                        pages
                ));
            }
        }
        return list;
    }

    public String serializeReferences(List<AiDtos.ReferencedNote> refs) {
        try {
            return objectMapper.writeValueAsString(refs != null ? refs : List.of());
        } catch (Exception e) {
            return "[]";
        }
    }

    public List<AiDtos.ReferencedNote> deserializeReferences(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return Arrays.asList(objectMapper.readValue(json, AiDtos.ReferencedNote[].class));
        } catch (Exception e) {
            return List.of();
        }
    }

    public record AiChatResult(
            String answer,
            List<AiDtos.ReferencedNote> referencedNotes,
            String modelUsed
    ) {}
}
