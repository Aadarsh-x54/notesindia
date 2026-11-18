package com.notesindia.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notesindia.common.ApiException;
import com.notesindia.note.Note;
import com.notesindia.note.NoteRepository;
import com.notesindia.note.NoteStatus;
import com.notesindia.storage.FileValidator;
import com.notesindia.user.User;
import com.notesindia.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class PadhakuAiService {

    private static final Logger log = LoggerFactory.getLogger(PadhakuAiService.class);

    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;
    private final NoteRepository noteRepository;
    private final UserRepository userRepository;
    private final AiServiceClient aiServiceClient;
    private final FileValidator fileValidator;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public PadhakuAiService(
            AiConversationRepository conversationRepository,
            AiMessageRepository messageRepository,
            NoteRepository noteRepository,
            UserRepository userRepository,
            AiServiceClient aiServiceClient,
            FileValidator fileValidator,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.noteRepository = noteRepository;
        this.userRepository = userRepository;
        this.aiServiceClient = aiServiceClient;
        this.fileValidator = fileValidator;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public AiDtos.AiStatusResponse getStatus() {
        return aiServiceClient.getStatus();
    }

    @Transactional(readOnly = true)
    public List<AiDtos.ConversationSummary> listConversations(UUID userId) {
        return conversationRepository.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public AiDtos.ConversationDetail createConversation(UUID userId, AiDtos.CreateConversationRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("User not found"));

        Note focusedNote = null;
        if (request != null && request.focusedNoteId() != null) {
            focusedNote = resolveAuthorizedFocusedNote(request.focusedNoteId());
        }

        String title = (request != null && request.title() != null && !request.title().isBlank())
                ? request.title().trim()
                : (focusedNote != null ? "Study: " + truncate(focusedNote.getTitle(), 60) : "New Conversation");

        AiConversation conv = new AiConversation();
        conv.setUser(user);
        conv.setTitle(title);
        conv.setFocusedNote(focusedNote);
        AiConversation saved = conversationRepository.save(conv);

        return toDetail(saved, List.of());
    }

    @Transactional(readOnly = true)
    public AiDtos.ConversationDetail getConversation(UUID userId, UUID conversationId) {
        AiConversation conv = conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found"));
        List<AiMessage> messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        return toDetail(conv, messages);
    }

    @Transactional
    public void clearConversation(UUID userId, UUID conversationId) {
        AiConversation conv = conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found"));
        messageRepository.deleteByConversationId(conv.getId());
        conv.setUpdatedAt(Instant.now());
        conversationRepository.save(conv);
    }

    @Transactional
    public void deleteConversation(UUID userId, UUID conversationId) {
        AiConversation conv = conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found"));
        conversationRepository.delete(conv);
    }

    public AiDtos.ExtractedDocumentResponse extractDocumentForChat(MultipartFile file) {
        FileValidator.ValidatedFile validated = fileValidator.validate(file);
        try {
            return aiServiceClient.extractAdHocDocument(validated.originalFilename(), validated.bytes());
        } catch (Exception ex) {
            throw ApiException.serviceUnavailable(
                    "Padhaku AI service is currently unavailable for document extraction: " + ex.getMessage()
            );
        }
    }

    public AiDtos.MessageResponse sendMessage(UUID userId, UUID conversationId, AiDtos.ChatMessageRequest request) {
        PreparedChat prepared = transactionTemplate.execute(status -> {
            AiConversation conv = conversationRepository.findByIdAndUserId(conversationId, userId)
                    .orElseThrow(() -> ApiException.notFound("Conversation not found"));
            return prepareChatPayloadAndSaveUserMessage(conv, request);
        });
        if (prepared == null) {
            throw ApiException.notFound("Conversation not found");
        }

        AiServiceClient.AiChatResult result;
        try {
            result = aiServiceClient.chat(prepared.payload());
        } catch (Exception ex) {
            log.warn("Padhaku AI chat error: {}", ex.getMessage());
            result = buildOfflineFallback(request.message(), prepared.authorizedNoteIds());
        }

        List<AiDtos.ReferencedNote> authorizedRefs = filterAuthorizedReferences(
                result.referencedNotes(), prepared.authorizedNoteIds()
        );
        AiServiceClient.AiChatResult finalResult = new AiServiceClient.AiChatResult(
                result.answer(), authorizedRefs, result.modelUsed()
        );

        AiMessage assistantMsg = transactionTemplate.execute(status ->
                saveAssistantMessage(conversationId, finalResult.answer(), finalResult.referencedNotes(), finalResult.modelUsed())
        );
        return toMessageResponse(Objects.requireNonNull(assistantMsg));
    }

    /**
     * Streams Padhaku AI response via Server-Sent Events (SSE) while keeping Java as the
     * central authentication, document-permission, persistence, and rate-limiting authority.
     */
    public SseEmitter streamMessage(UUID userId, UUID conversationId, AiDtos.ChatMessageRequest request) {
        PreparedChat prepared = transactionTemplate.execute(status -> {
            AiConversation conv = conversationRepository.findByIdAndUserId(conversationId, userId)
                    .orElseThrow(() -> ApiException.notFound("Conversation not found"));
            return prepareChatPayloadAndSaveUserMessage(conv, request);
        });
        if (prepared == null) {
            throw ApiException.notFound("Conversation not found");
        }

        SseEmitter emitter = new SseEmitter(210_000L);
        StringBuilder fullAnswer = new StringBuilder();
        List<AiDtos.ReferencedNote> collectedRefs = Collections.synchronizedList(new ArrayList<>());
        final String[] modelUsed = {"local-llm"};
        AtomicBoolean finished = new AtomicBoolean(false);

        Disposable subscription = aiServiceClient.streamChat(prepared.payload()).subscribe(
                sse -> {
                    if (finished.get()) return;
                    try {
                        String rawData = sse.data();
                        if (rawData == null) return;
                        String trimmed = rawData.trim();
                        if (trimmed.isEmpty() || "[DONE]".equals(trimmed)) return;
                        if (trimmed.startsWith("data:")) {
                            trimmed = trimmed.substring(5).trim();
                        }
                        if (trimmed.isEmpty() || "[DONE]".equals(trimmed)) return;

                        JsonNode node = objectMapper.readTree(trimmed);
                        String type = node.path("type").asText("token");

                        if ("references".equals(type)) {
                            List<AiDtos.ReferencedNote> filtered = filterAuthorizedReferences(
                                    aiServiceClient.parseReferences(node.path("referenced_notes")),
                                    prepared.authorizedNoteIds()
                            );
                            collectedRefs.clear();
                            collectedRefs.addAll(filtered);
                            emitter.send(SseEmitter.event().name("references").data(filtered));
                        } else if ("token".equals(type)) {
                            String token = node.path("token").asText("");
                            if (!token.isEmpty()) {
                                fullAnswer.append(token);
                                emitter.send(SseEmitter.event().name("token").data(Map.of("token", token)));
                            }
                        } else if ("done".equals(type)) {
                            modelUsed[0] = node.path("model_used").asText(modelUsed[0]);
                        }
                    } catch (IOException ioEx) {
                        finished.set(true);
                        log.debug("SSE client disconnected during stream: {}", ioEx.getMessage());
                    } catch (Exception parseEx) {
                        log.debug("SSE chunk parse skipped: {}", parseEx.getMessage());
                    }
                },
                error -> {
                    if (!finished.compareAndSet(false, true)) return;
                    log.warn("Padhaku AI streaming failed ({}), sending helpful fallback", error.getMessage());
                    try {
                        AiServiceClient.AiChatResult fallback = buildOfflineFallback(
                                request.message(), prepared.authorizedNoteIds()
                        );
                        AiMessage saved = transactionTemplate.execute(status ->
                                saveAssistantMessage(conversationId, fallback.answer(), fallback.referencedNotes(), fallback.modelUsed())
                        );
                        if (!fallback.referencedNotes().isEmpty()) {
                            emitter.send(SseEmitter.event().name("references").data(fallback.referencedNotes()));
                        }
                        emitter.send(SseEmitter.event().name("token").data(Map.of("token", fallback.answer())));
                        emitter.send(SseEmitter.event().name("done").data(toMessageResponse(Objects.requireNonNull(saved))));
                        emitter.complete();
                    } catch (Exception ioEx) {
                        emitter.completeWithError(ioEx);
                    }
                },
                () -> {
                    if (!finished.compareAndSet(false, true)) return;
                    try {
                        String trimmedContent = fullAnswer.toString().trim();
                        String finalContent = trimmedContent.isEmpty()
                                ? "I could not generate a response. Please verify Ollama has the configured model pulled."
                                : trimmedContent;
                        List<AiDtos.ReferencedNote> finalRefs = new ArrayList<>(collectedRefs);
                        AiMessage saved = transactionTemplate.execute(status ->
                                saveAssistantMessage(conversationId, finalContent, finalRefs, modelUsed[0])
                        );
                        emitter.send(SseEmitter.event().name("done").data(toMessageResponse(Objects.requireNonNull(saved))));
                        emitter.complete();
                    } catch (Exception ex) {
                        emitter.completeWithError(ex);
                    }
                }
        );

        emitter.onCompletion(() -> {
            finished.set(true);
            subscription.dispose();
        });
        emitter.onTimeout(() -> {
            finished.set(true);
            subscription.dispose();
            emitter.complete();
        });
        emitter.onError(ex -> {
            finished.set(true);
            subscription.dispose();
        });

        return emitter;
    }

    public AiDtos.MessageResponse regenerateLastResponse(UUID userId, UUID conversationId) {
        PreparedChat prepared = transactionTemplate.execute(status -> {
            AiConversation conv = conversationRepository.findByIdAndUserId(conversationId, userId)
                    .orElseThrow(() -> ApiException.notFound("Conversation not found"));

            List<AiMessage> messages = new ArrayList<>(
                    messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)
            );
            if (messages.isEmpty()) {
                throw ApiException.badRequest("No messages in this conversation to regenerate");
            }

            // Remove trailing assistant message if present
            AiMessage last = messages.get(messages.size() - 1);
            if (last.getRole() == AiMessageRole.ASSISTANT) {
                messageRepository.delete(last);
                messages.remove(messages.size() - 1);
            }

            int lastUserIdx = -1;
            for (int i = messages.size() - 1; i >= 0; i--) {
                if (messages.get(i).getRole() == AiMessageRole.USER) {
                    lastUserIdx = i;
                    break;
                }
            }
            if (lastUserIdx < 0) {
                throw ApiException.badRequest("No user prompt found to regenerate");
            }

            AiMessage lastUserMsg = messages.get(lastUserIdx);
            List<AiMessage> priorHistory = messages.subList(0, lastUserIdx);

            // Re-validate focused note permission if set on conversation
            if (conv.getFocusedNote() != null && conv.getFocusedNote().getStatus() != NoteStatus.PUBLISHED) {
                throw ApiException.forbidden("The focused note in this conversation is restricted and cannot be accessed");
            }

            Set<String> authorizedIds = resolveAuthorizedNoteIds();
            Map<String, Object> payload = buildPayloadFromHistory(
                    conv, priorHistory, lastUserMsg.getContent(), "GENERAL", null, null, authorizedIds
            );
            return new PreparedChat(payload, authorizedIds, lastUserMsg.getContent());
        });
        if (prepared == null) {
            throw ApiException.notFound("Conversation not found");
        }

        AiServiceClient.AiChatResult result;
        try {
            result = aiServiceClient.chat(prepared.payload());
        } catch (Exception ex) {
            result = buildOfflineFallback(prepared.question(), prepared.authorizedNoteIds());
        }

        List<AiDtos.ReferencedNote> authorizedRefs = filterAuthorizedReferences(
                result.referencedNotes(), prepared.authorizedNoteIds()
        );
        AiServiceClient.AiChatResult finalResult = new AiServiceClient.AiChatResult(
                result.answer(), authorizedRefs, result.modelUsed()
        );

        AiMessage regenerated = transactionTemplate.execute(status ->
                saveAssistantMessage(conversationId, finalResult.answer(), finalResult.referencedNotes(), finalResult.modelUsed())
        );
        return toMessageResponse(Objects.requireNonNull(regenerated));
    }

    /**
     * Java is the single source of truth for document access permissions.
     * Only PUBLISHED notes are authorized for RAG retrieval; FLAGGED and REMOVED notes are strictly excluded.
     */
    private Note resolveAuthorizedFocusedNote(UUID noteId) {
        Note note = noteRepository.findById(noteId)
                .orElseThrow(() -> ApiException.notFound("Focused note not found"));
        if (note.getStatus() != NoteStatus.PUBLISHED) {
            throw ApiException.forbidden("This document is restricted and cannot be accessed by Padhaku AI");
        }
        return note;
    }

    private Set<String> resolveAuthorizedNoteIds() {
        List<UUID> ids = noteRepository.findIdsByStatus(NoteStatus.PUBLISHED);
        Set<String> allowed = new LinkedHashSet<>(ids.size());
        for (UUID id : ids) {
            allowed.add(id.toString());
        }
        return allowed;
    }

    private List<AiDtos.ReferencedNote> filterAuthorizedReferences(
            List<AiDtos.ReferencedNote> refs,
            Set<String> authorizedNoteIds
    ) {
        if (refs == null || refs.isEmpty()) return List.of();
        return refs.stream()
                .filter(r -> r.noteId() != null && authorizedNoteIds.contains(r.noteId()))
                .toList();
    }

    private PreparedChat prepareChatPayloadAndSaveUserMessage(
            AiConversation conv,
            AiDtos.ChatMessageRequest request
    ) {
        if (request.focusedNoteId() != null) {
            Note focused = resolveAuthorizedFocusedNote(request.focusedNoteId());
            conv.setFocusedNote(focused);
        } else if (conv.getFocusedNote() != null && conv.getFocusedNote().getStatus() != NoteStatus.PUBLISHED) {
            throw ApiException.forbidden("The focused note in this conversation is restricted and cannot be accessed");
        }

        List<AiMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conv.getId());

        String question = request.message().trim();
        if (history.isEmpty() && "New Conversation".equals(conv.getTitle())) {
            conv.setTitle(truncate(question, 70));
        }

        AiMessage userMessage = new AiMessage();
        userMessage.setConversation(conv);
        userMessage.setRole(AiMessageRole.USER);
        userMessage.setContent(question);
        messageRepository.save(userMessage);

        conv.setUpdatedAt(Instant.now());
        conversationRepository.save(conv);

        Set<String> authorizedIds = resolveAuthorizedNoteIds();
        Map<String, Object> payload = buildPayloadFromHistory(
                conv, history, question, request.mode(),
                request.adHocDocumentText(), request.adHocDocumentName(),
                authorizedIds
        );
        return new PreparedChat(payload, authorizedIds, question);
    }

    private Map<String, Object> buildPayloadFromHistory(
            AiConversation conv,
            List<AiMessage> history,
            String question,
            String mode,
            String adHocDocumentText,
            String adHocDocumentName,
            Set<String> authorizedNoteIds
    ) {
        List<Map<String, String>> formattedHistory = history.stream()
                .skip(Math.max(0, history.size() - 10))
                .map(m -> Map.of(
                        "role", m.getRole().name().toLowerCase(),
                        "content", m.getContent()
                ))
                .toList();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("question", question);
        payload.put("mode", mode != null && !mode.isBlank() ? mode.toUpperCase() : "GENERAL");
        payload.put("history", formattedHistory);
        payload.put("allowed_note_ids", new ArrayList<>(authorizedNoteIds));
        if (conv.getFocusedNote() != null) {
            payload.put("focused_note_id", conv.getFocusedNote().getId().toString());
            payload.put("focused_note_title", conv.getFocusedNote().getTitle());
        }
        if (adHocDocumentText != null && !adHocDocumentText.isBlank()) {
            payload.put("ad_hoc_document_text", adHocDocumentText);
            payload.put("ad_hoc_document_name", adHocDocumentName != null ? adHocDocumentName : "Uploaded Document");
        }
        return payload;
    }

    private AiMessage saveAssistantMessage(
            UUID conversationId,
            String content,
            List<AiDtos.ReferencedNote> refs,
            String modelUsed
    ) {
        AiConversation conv = conversationRepository.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation not found"));

        AiMessage msg = new AiMessage();
        msg.setConversation(conv);
        msg.setRole(AiMessageRole.ASSISTANT);
        msg.setContent(content);
        msg.setReferencedNotesJson(aiServiceClient.serializeReferences(refs));
        msg.setModelUsed(modelUsed);
        AiMessage saved = messageRepository.save(msg);

        conv.setUpdatedAt(Instant.now());
        conversationRepository.save(conv);
        return saved;
    }

    private AiServiceClient.AiChatResult buildOfflineFallback(String question, Set<String> authorizedNoteIds) {
        List<AiDtos.ReferencedNote> refs = transactionTemplate.execute(status -> {
            List<Note> matchingNotes = noteRepository.globalSearch(
                    question.length() > 80 ? question.substring(0, 80) : question,
                    NoteStatus.PUBLISHED,
                    org.springframework.data.domain.PageRequest.of(0, 3)
            ).getContent();

            return matchingNotes.stream()
                    .filter(n -> authorizedNoteIds.contains(n.getId().toString()))
                    .map(n -> new AiDtos.ReferencedNote(
                            n.getId().toString(),
                            n.getTitle(),
                            0.75,
                            truncate(n.getDescription(), 180),
                            n.getCategories().stream().map(c -> c.getName()).toList(),
                            List.of()
                    ))
                    .toList();
        });
        if (refs == null) refs = List.of();

        StringBuilder sb = new StringBuilder();
        sb.append("**Padhaku AI Local LLM Notice**\n\n");
        sb.append("The local Python FastAPI / Ollama AI engine is currently offline or still loading. ");
        sb.append("To enable full local LLM + RAG tutoring:\n");
        sb.append("1. Start Ollama and pull a model: `ollama pull qwen2.5:1.5b` (or `qwen3:8b` on higher-RAM systems).\n");
        sb.append("2. Start the Python AI service: `uvicorn app.main:app --port 8000` (or run `docker compose up`).\n\n");
        if (!refs.isEmpty()) {
            sb.append("Meanwhile, I searched NotesIndia directly and found **").append(refs.size())
              .append(" relevant note(s)** linked below for your query.");
        } else {
            sb.append("You can browse NotesIndia's chronological feed or use global search while Ollama starts up.");
        }
        return new AiServiceClient.AiChatResult(sb.toString(), refs, "offline-fallback");
    }

    private AiDtos.ConversationSummary toSummary(AiConversation c) {
        return new AiDtos.ConversationSummary(
                c.getId(),
                c.getTitle(),
                c.getFocusedNote() != null ? c.getFocusedNote().getId() : null,
                c.getFocusedNote() != null ? c.getFocusedNote().getTitle() : null,
                c.getCreatedAt(),
                c.getUpdatedAt()
        );
    }

    private AiDtos.ConversationDetail toDetail(AiConversation c, List<AiMessage> messages) {
        return new AiDtos.ConversationDetail(
                c.getId(),
                c.getTitle(),
                c.getFocusedNote() != null ? c.getFocusedNote().getId() : null,
                c.getFocusedNote() != null ? c.getFocusedNote().getTitle() : null,
                c.getCreatedAt(),
                c.getUpdatedAt(),
                messages.stream().map(this::toMessageResponse).toList()
        );
    }

    private AiDtos.MessageResponse toMessageResponse(AiMessage m) {
        return new AiDtos.MessageResponse(
                m.getId(),
                m.getRole(),
                m.getContent(),
                aiServiceClient.deserializeReferences(m.getReferencedNotesJson()),
                m.getModelUsed(),
                m.getCreatedAt()
        );
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max - 3) + "...";
    }

    private record PreparedChat(
            Map<String, Object> payload,
            Set<String> authorizedNoteIds,
            String question
    ) {}
}
