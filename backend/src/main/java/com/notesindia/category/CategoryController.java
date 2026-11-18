package com.notesindia.category;

import com.notesindia.common.ApiResponse;
import com.notesindia.user.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CategoryDtos.CategoryResponse>>> listCategories(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Boolean rootOnly
    ) {
        return ResponseEntity.ok(ApiResponse.ok(categoryService.listAll(q, rootOnly)));
    }

    @GetMapping("/{slug}")
    public ResponseEntity<ApiResponse<CategoryDtos.CategoryResponse>> getBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.ok(categoryService.getBySlug(slug)));
    }

    @GetMapping("/check-duplicate")
    public ResponseEntity<ApiResponse<CategoryDtos.DuplicateCheckResponse>> checkDuplicate(
            @RequestParam String name
    ) {
        return ResponseEntity.ok(ApiResponse.ok(categoryService.checkDuplicate(name)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CategoryDtos.CategoryResponse>> createCategory(
            @Valid @RequestBody CategoryDtos.CreateCategoryRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        CategoryDtos.CategoryResponse created = categoryService.create(
                request,
                principal != null ? principal.id() : null
        );
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Category created", created));
    }
}
