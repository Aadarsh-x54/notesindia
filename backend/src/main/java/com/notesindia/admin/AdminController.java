package com.notesindia.admin;

import com.notesindia.category.CategoryDtos;
import com.notesindia.common.ApiResponse;
import com.notesindia.common.PageResponse;
import com.notesindia.note.NoteDtos;
import com.notesindia.note.ReportStatus;
import com.notesindia.user.AuthDtos;
import com.notesindia.user.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasAnyRole('ADMIN', 'MODERATOR')")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<AdminDtos.DashboardStats>> getStats() {
        return ResponseEntity.ok(ApiResponse.ok(adminService.getDashboardStats()));
    }

    @GetMapping("/users")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PageResponse<AuthDtos.UserResponse>>> listUsers(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(ApiResponse.ok(adminService.listUsers(q, page, size)));
    }

    @PatchMapping("/users/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<AuthDtos.UserResponse>> updateUser(
            @PathVariable UUID id,
            @RequestBody AdminDtos.UpdateUserRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok("User updated", adminService.updateUser(id, request, principal.id())));
    }

    @GetMapping("/notes")
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> listNotes(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(ApiResponse.ok(adminService.listNotes(q, page, size)));
    }

    @PatchMapping("/notes/{id}/status")
    public ResponseEntity<ApiResponse<NoteDtos.NoteResponse>> updateNoteStatus(
            @PathVariable UUID id,
            @Valid @RequestBody AdminDtos.UpdateNoteStatusRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Note status updated",
                adminService.updateNoteStatus(id, request.status(), principal.id())
        ));
    }

    @PostMapping("/notes/{id}/reindex")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> reindexNote(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        boolean indexed = adminService.reindexNote(id, principal.id());
        return ResponseEntity.ok(ApiResponse.ok(
                indexed ? "Note indexed into Padhaku AI" : "AI service unavailable; indexing deferred",
                Map.of("indexed", indexed)
        ));
    }

    @GetMapping("/reports")
    public ResponseEntity<ApiResponse<PageResponse<AdminDtos.ReportResponse>>> listReports(
            @RequestParam(required = false) ReportStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(ApiResponse.ok(adminService.listReports(status, page, size)));
    }

    @PostMapping("/reports/{id}/review")
    public ResponseEntity<ApiResponse<AdminDtos.ReportResponse>> reviewReport(
            @PathVariable UUID id,
            @Valid @RequestBody AdminDtos.ReviewReportRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Report resolved",
                adminService.reviewReport(id, request, principal.id())
        ));
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<ApiResponse<CategoryDtos.CategoryResponse>> updateCategory(
            @PathVariable UUID id,
            @Valid @RequestBody CategoryDtos.UpdateCategoryRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Category updated",
                adminService.updateCategory(id, request, principal.id())
        ));
    }

    @PostMapping("/categories/merge")
    public ResponseEntity<ApiResponse<Void>> mergeCategories(
            @Valid @RequestBody AdminDtos.MergeCategoriesRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        adminService.mergeCategories(request, principal.id());
        return ResponseEntity.ok(ApiResponse.ok("Categories merged successfully", null));
    }

    @DeleteMapping("/categories/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCategory(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        adminService.deleteCategory(id, principal.id());
        return ResponseEntity.ok(ApiResponse.ok("Category deleted", null));
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<ApiResponse<PageResponse<AdminDtos.AuditLogResponse>>> listAuditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        return ResponseEntity.ok(ApiResponse.ok(adminService.listAuditLogs(page, size)));
    }
}
