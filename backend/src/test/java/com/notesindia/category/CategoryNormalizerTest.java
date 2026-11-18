package com.notesindia.category;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CategoryNormalizerTest {

    private final CategoryNormalizer normalizer = new CategoryNormalizer();

    @Test
    void normalizesWhitespaceAndSpecialLanguages() {
        assertEquals("ssc cgl", normalizer.normalize("  SSC   CGL  "));
        assertEquals("cpp", normalizer.normalize("C++"));
        assertEquals("ssc-cgl", normalizer.toSlug("SSC CGL"));
    }

    @Test
    void detectsLikelyDuplicateSpellings() {
        assertTrue(normalizer.isLikelyDuplicate(
                normalizer.normalize("JavaScript"),
                normalizer.normalize("Java Script")
        ));
        assertTrue(normalizer.isLikelyDuplicate(
                normalizer.normalize("Mathematics"),
                normalizer.normalize("Mathematic")
        ));
        assertFalse(normalizer.isLikelyDuplicate(
                normalizer.normalize("Java"),
                normalizer.normalize("Python")
        ));
    }
}
