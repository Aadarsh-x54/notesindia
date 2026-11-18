package com.notesindia;

import com.notesindia.category.CategoryDtos;
import com.notesindia.category.CategoryService;
import com.notesindia.note.NoteDtos;
import com.notesindia.note.NoteService;
import com.notesindia.user.AuthDtos;
import com.notesindia.user.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class NotesIndiaIntegrationTest {

    @Autowired private AuthService authService;
    @Autowired private CategoryService categoryService;
    @Autowired private NoteService noteService;

    @Test
    void uploadCreatesDynamicCategoriesAndAppearsInChronologicalFeedWithoutDuplication() {
        AuthDtos.AuthResponse user = authService.register(new AuthDtos.RegisterRequest(
                "tester1", "tester1@notesindia.in", "StrongPass@123", "Test Learner", "IIT Delhi"
        ));

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "java-inheritance.txt",
                "text/plain",
                "Inheritance in Java allows subclasses to extend parent classes.".getBytes(StandardCharsets.UTF_8)
        );

        NoteDtos.NoteResponse uploaded = noteService.uploadNote(
                file,
                "Java Inheritance Complete Guide",
                "Comprehensive explanation of single, multilevel, and hierarchical inheritance in Java.",
                "Java OOP",
                "IIT Delhi",
                "Test Learner",
                List.of(),
                List.of(
                        new NoteDtos.NewCategoryInput("Programming", null, "#A855F7"),
                        new NoteDtos.NewCategoryInput("Java", null, "#F97316")
                ),
                user.user().id()
        );

        assertNotNull(uploaded.id());
        assertEquals(2, uploaded.categories().size());

        // Feed contains exactly one canonical note (not duplicated per category)
        var feed = noteService.getRecentFeed(0, 10, user.user().id());
        assertEquals(1, feed.totalElements());
        assertEquals(uploaded.id(), feed.items().get(0).id());

        // Both dynamically discovered categories appear in category exploration and resolve the same note
        List<CategoryDtos.CategoryResponse> categories = categoryService.listAll(null, false);
        assertEquals(2, categories.size());

        var javaNotes = noteService.getNotesByCategorySlug("java", true, 0, 10, user.user().id());
        var progNotes = noteService.getNotesByCategorySlug("programming", true, 0, 10, user.user().id());
        assertEquals(1, javaNotes.totalElements());
        assertEquals(1, progNotes.totalElements());
        assertEquals(javaNotes.items().get(0).id(), progNotes.items().get(0).id());
    }
}
