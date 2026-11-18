package com.notesindia.ai;

import com.notesindia.common.ApiResponse;
import com.notesindia.user.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai")
public class PadhakuAiController {

    private final PadhakuAiService padhakuAiService;

    public PadhakuAiController(PadhakuAiService padhakuAiService) {
        this.padhakuAiService = padhakuAiService;
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<AiDtos.AiStatusResponse>> getStatus() {
        return ResponseEntity.ok(ApiResponse.ok(padhakuAiService.getStatus()));
    }

    @GetMapping("/conversations")
    public ResponseEntity<ApiResponse<List<AiDtos.ConversationSummary>>> listConversations(
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(padhakuAiService.listConversations(principal.id())));
    }

    @PostMapping("/conversations")
    public ResponseEntity<ApiResponse<AiDtos.ConversationDetail>> createConversation(
            @RequestBody(required = false) @Valid AiDtos.CreateConversationRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(padhakuAiService.createConversation(principal.id(), request)));
    }

    @GetMapping("/conversations/{id}")
    public ResponseEntity<ApiResponse<AiDtos.ConversationDetail>> getConversation(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(padhakuAiService.getConversation(principal.id(), id)));
    }

    @DeleteMapping("/conversations/{id}/messages")
    public ResponseEntity<ApiResponse<Void>> clearConversation(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        padhakuAiService.clearConversation(principal.id(), id);
        return ResponseEntity.ok(ApiResponse.ok("Conversation cleared", null));
    }

    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteConversation(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        padhakuAiService.deleteConversation(principal.id(), id);
        return ResponseEntity.ok(ApiResponse.ok("Conversation deleted", null));
    }

    @PostMapping("/conversations/{id}/messages")
    public ResponseEntity<ApiResponse<AiDtos.MessageResponse>> sendMessage(
            @PathVariable UUID id,
            @Valid @RequestBody AiDtos.ChatMessageRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(padhakuAiService.sendMessage(principal.id(), id, request)));
    }

    @PostMapping(value = "/conversations/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamMessage(
            @PathVariable UUID id,
            @Valid @RequestBody AiDtos.ChatMessageRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return padhakuAiService.streamMessage(principal.id(), id, request);
    }

    @PostMapping("/conversations/{id}/regenerate")
    public ResponseEntity<ApiResponse<AiDtos.MessageResponse>> regenerate(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(padhakuAiService.regenerateLastResponse(principal.id(), id)));
    }

    @PostMapping(value = "/extract-document", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<AiDtos.ExtractedDocumentResponse>> extractDocument(
            @RequestPart("file") MultipartFile file
    ) {
        return ResponseEntity.ok(ApiResponse.ok(padhakuAiService.extractDocumentForChat(file)));
    }
}
