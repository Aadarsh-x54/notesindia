package com.notesindia.category;

import com.notesindia.common.ApiException;
import com.notesindia.user.User;
import com.notesindia.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CategoryService {

    private static final long RECENTLY_ADDED_DAYS = 7;

    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final CategoryNormalizer normalizer;
    private final CategoryColorPalette colorPalette;

    public CategoryService(
            CategoryRepository categoryRepository,
            UserRepository userRepository,
            CategoryNormalizer normalizer,
            CategoryColorPalette colorPalette
    ) {
        this.categoryRepository = categoryRepository;
        this.userRepository = userRepository;
        this.normalizer = normalizer;
        this.colorPalette = colorPalette;
    }

    @Transactional(readOnly = true)
    public List<CategoryDtos.CategoryResponse> listAll(String search, Boolean rootOnly) {
        List<Category> categories;
        if (search != null && !search.isBlank()) {
            categories = categoryRepository.searchCategories(search.trim());
        } else if (Boolean.TRUE.equals(rootOnly)) {
            categories = categoryRepository.findByParentIsNullOrderByNameAsc();
        } else {
            categories = categoryRepository.findAll()
                    .stream()
                    .sorted(Comparator.comparing(Category::getName, String.CASE_INSENSITIVE_ORDER))
                    .toList();
        }

        Map<UUID, Long> noteCounts = loadNoteCountMap();
        Map<UUID, List<Category>> childrenByParent = categoryRepository.findAll().stream()
                .filter(c -> c.getParent() != null)
                .collect(Collectors.groupingBy(c -> c.getParent().getId()));

        return categories.stream()
                .map(c -> toResponse(c, noteCounts, childrenByParent))
                .toList();
    }

    @Transactional(readOnly = true)
    public CategoryDtos.CategoryResponse getBySlug(String slug) {
        Category category = categoryRepository.findBySlug(slug.toLowerCase())
                .orElseThrow(() -> ApiException.notFound("Category '" + slug + "' not found"));

        Map<UUID, Long> noteCounts = loadNoteCountMap();
        List<Category> children = categoryRepository.findByParentIdOrderByNameAsc(category.getId());
        Map<UUID, List<Category>> childrenMap = Map.of(category.getId(), children);

        return toResponse(category, noteCounts, childrenMap);
    }

    @Transactional(readOnly = true)
    public CategoryDtos.DuplicateCheckResponse checkDuplicate(String rawName) {
        String normalized = normalizer.normalize(rawName);
        if (normalized.isBlank()) {
            return new CategoryDtos.DuplicateCheckResponse(false, null, List.of());
        }

        Optional<Category> exact = categoryRepository.findByNormalizedName(normalized);
        if (exact.isPresent()) {
            return new CategoryDtos.DuplicateCheckResponse(
                    true,
                    CategoryDtos.CategorySummary.from(exact.get()),
                    List.of()
            );
        }

        List<CategoryDtos.CategorySummary> similar = categoryRepository.findAll().stream()
                .filter(c -> normalizer.isLikelyDuplicate(normalized, c.getNormalizedName()))
                .map(CategoryDtos.CategorySummary::from)
                .limit(5)
                .toList();

        return new CategoryDtos.DuplicateCheckResponse(false, null, similar);
    }

    @Transactional
    public CategoryDtos.CategoryResponse create(CategoryDtos.CreateCategoryRequest request, UUID creatorId) {
        Category saved = findOrCreateEntity(
                request.name(),
                request.description(),
                request.accentColor(),
                request.parentId(),
                creatorId,
                false
        );

        Map<UUID, Long> noteCounts = loadNoteCountMap();
        return toResponse(saved, noteCounts, Map.of());
    }

    @Transactional
    public Category findOrCreateEntity(
            String rawName,
            String description,
            String accentColor,
            UUID parentId,
            UUID creatorId,
            boolean returnExistingIfDuplicate
    ) {
        String cleaned = normalizer.cleanDisplayName(rawName);
        if (cleaned.length() < 2) {
            throw ApiException.badRequest("Category name must be at least 2 characters");
        }
        String normalized = normalizer.normalize(cleaned);
        if (normalized.isBlank()) {
            throw ApiException.badRequest("Invalid category name");
        }

        Optional<Category> existing = categoryRepository.findByNormalizedName(normalized);
        if (existing.isPresent()) {
            if (returnExistingIfDuplicate) {
                return existing.get();
            }
            throw ApiException.conflict("Category '" + existing.get().getName() + "' already exists");
        }

        Category parent = null;
        if (parentId != null) {
            parent = categoryRepository.findById(parentId)
                    .orElseThrow(() -> ApiException.notFound("Parent category not found"));
        }

        User creator = creatorId != null ? userRepository.findById(creatorId).orElse(null) : null;

        String baseSlug = normalizer.toSlug(cleaned);
        String uniqueSlug = baseSlug;
        int suffix = 2;
        while (categoryRepository.findBySlug(uniqueSlug).isPresent()) {
            uniqueSlug = baseSlug + "-" + suffix++;
        }

        Category category = new Category();
        category.setName(cleaned);
        category.setNormalizedName(normalized);
        category.setSlug(uniqueSlug);
        category.setDescription(description != null && !description.isBlank() ? description.trim() : null);
        category.setAccentColor(colorPalette.pickColor(normalized, accentColor));
        category.setParent(parent);
        category.setCreatedBy(creator);

        return categoryRepository.save(category);
    }

    @Transactional
    public CategoryDtos.CategoryResponse update(UUID id, CategoryDtos.UpdateCategoryRequest request) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Category not found"));

        String cleaned = normalizer.cleanDisplayName(request.name());
        String normalized = normalizer.normalize(cleaned);
        categoryRepository.findByNormalizedName(normalized)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw ApiException.conflict("Another category named '" + other.getName() + "' already exists");
                });

        category.setName(cleaned);
        category.setNormalizedName(normalized);
        category.setDescription(request.description() != null ? request.description().trim() : null);
        if (request.accentColor() != null && !request.accentColor().isBlank()) {
            category.setAccentColor(colorPalette.pickColor(normalized, request.accentColor()));
        }

        if (request.parentId() != null) {
            if (request.parentId().equals(id)) {
                throw ApiException.badRequest("A category cannot be its own parent");
            }
            Category parent = categoryRepository.findById(request.parentId())
                    .orElseThrow(() -> ApiException.notFound("Parent category not found"));
            if (createsCycle(id, parent)) {
                throw ApiException.badRequest("Parent selection would create a circular hierarchy");
            }
            category.setParent(parent);
        } else {
            category.setParent(null);
        }

        Category saved = categoryRepository.save(category);
        Map<UUID, Long> noteCounts = loadNoteCountMap();
        List<Category> children = categoryRepository.findByParentIdOrderByNameAsc(saved.getId());
        return toResponse(saved, noteCounts, Map.of(saved.getId(), children));
    }

    /**
     * Collects the category ID and all descendant category IDs so category pages
     * can optionally show notes from subcategories too.
     */
    @Transactional(readOnly = true)
    public Set<UUID> collectCategoryAndDescendantIds(UUID rootId) {
        Set<UUID> result = new LinkedHashSet<>();
        Deque<UUID> queue = new ArrayDeque<>();
        queue.add(rootId);
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            if (result.add(current)) {
                List<Category> children = categoryRepository.findByParentIdOrderByNameAsc(current);
                for (Category child : children) {
                    queue.add(child.getId());
                }
            }
        }
        return result;
    }

    private boolean createsCycle(UUID targetId, Category candidateParent) {
        Category cursor = candidateParent;
        Set<UUID> visited = new HashSet<>();
        while (cursor != null) {
            if (cursor.getId().equals(targetId) || !visited.add(cursor.getId())) {
                return true;
            }
            cursor = cursor.getParent();
        }
        return false;
    }

    private Map<UUID, Long> loadNoteCountMap() {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : categoryRepository.countPublishedNotesByCategory()) {
            UUID catId = row[0] instanceof UUID u ? u : UUID.fromString(row[0].toString());
            long count = ((Number) row[1]).longValue();
            counts.put(catId, count);
        }
        return counts;
    }

    private CategoryDtos.CategoryResponse toResponse(
            Category c,
            Map<UUID, Long> noteCounts,
            Map<UUID, List<Category>> childrenMap
    ) {
        boolean recentlyAdded = c.getCreatedAt() != null &&
                c.getCreatedAt().isAfter(Instant.now().minus(RECENTLY_ADDED_DAYS, ChronoUnit.DAYS));

        List<CategoryDtos.CategorySummary> childSummaries = childrenMap.getOrDefault(c.getId(), List.of())
                .stream()
                .sorted(Comparator.comparing(Category::getName, String.CASE_INSENSITIVE_ORDER))
                .map(CategoryDtos.CategorySummary::from)
                .toList();

        return new CategoryDtos.CategoryResponse(
                c.getId(),
                c.getName(),
                c.getSlug(),
                c.getDescription(),
                c.getAccentColor(),
                c.getParent() != null ? c.getParent().getId() : null,
                c.getParent() != null ? c.getParent().getName() : null,
                c.getParent() != null ? c.getParent().getSlug() : null,
                noteCounts.getOrDefault(c.getId(), 0L),
                recentlyAdded,
                c.getCreatedAt(),
                childSummaries
        );
    }
}
