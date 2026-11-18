package com.notesindia.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AiDtos {

    private AiDtos() {}

    public record CreateConversationRequest(
            @Size(max = 200) String title,
            UUID focusedNoteId
    ) {}

    public record ChatMessageRequest(
            @NotBlank @Size(max = 8000) String message,
            UUID focusedNoteId,
            String mode, // GENERAL, SUMMARY, SIMPLIFY, MCQ, PRACTICE, REVISION, CODE
            String adHocDocumentText,
            String adHocDocumentName
    ) {}

    public record ReferencedNote(
            String noteId,
            String title,
            double score,
            String snippet,
            List<String> categories,
            List<Integer> pageNumbers
    ) {
        public ReferencedNote {
            categories = categories != null ? categories : List.of();
            pageNumbers = pageNumbers != null ? pageNumbers : List.of();
        }
    }

    public record MessageResponse(
            UUID id,
            AiMessageRole role,
            String content,
            List<ReferencedNote> referencedNotes,
            String modelUsed,
            Instant createdAt
    ) {}

    public record ConversationSummary(
            UUID id,
            String title,
            UUID focusedNoteId,
            String focusedNoteTitle,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record ConversationDetail(
            UUID id,
            String title,
            UUID focusedNoteId,
            String focusedNoteTitle,
            Instant createdAt,
            Instant updatedAt,
            List<MessageResponse> messages
    ) {}

    public record AiStatusResponse(
            boolean available,
            String provider,
            String activeModel,
            String vectorStore,
            long indexedChunks,
            String message
    ) {}

    public record ExtractedDocumentResponse(
            String filename,
            int pageCount,
            int charCount,
            String extractedText
    ) {}
}
