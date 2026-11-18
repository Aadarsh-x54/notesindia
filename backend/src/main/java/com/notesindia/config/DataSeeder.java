package com.notesindia.config;

import com.notesindia.category.Category;
import com.notesindia.category.CategoryService;
import com.notesindia.note.Note;
import com.notesindia.note.NoteRepository;
import com.notesindia.note.NoteStatus;
import com.notesindia.storage.FileValidator;
import com.notesindia.storage.StorageService;
import com.notesindia.user.Role;
import com.notesindia.user.User;
import com.notesindia.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.Set;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final boolean seedEnabled;
    private final UserRepository userRepository;
    private final CategoryService categoryService;
    private final NoteRepository noteRepository;
    private final StorageService storageService;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(
            @Value("${notesindia.seed-demo-data:true}") boolean seedEnabled,
            UserRepository userRepository,
            CategoryService categoryService,
            NoteRepository noteRepository,
            StorageService storageService,
            PasswordEncoder passwordEncoder
    ) {
        this.seedEnabled = seedEnabled;
        this.userRepository = userRepository;
        this.categoryService = categoryService;
        this.noteRepository = noteRepository;
        this.storageService = storageService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!seedEnabled || userRepository.count() > 0) {
            return;
        }

        log.info("Seeding initial NotesIndia accounts, dynamic categories, and sample educational notes...");

        User admin = createUser("admin", "admin@notesindia.in", "Admin@123",
                "NotesIndia Admin", "Platform Administrator", "NotesIndia", Role.ADMIN);
        User aarav = createUser("aarav_sharma", "aarav@notesindia.in", "Student@123",
                "Aarav Sharma", "SSC CGL & Quantitative Aptitude aspirant", "Delhi University", Role.USER);
        User priya = createUser("priya_verma", "priya@notesindia.in", "Student@123",
                "Priya Verma", "B.Tech CSE | Java & Systems Engineering", "NIT Prayagraj", Role.USER);

        // Hierarchical dynamic categories (can grow infinitely via uploads)
        Category ssc = cat("SSC", "Staff Selection Commission competitive exam notes", "#3B82F6", null, admin);
        Category sscCgl = cat("SSC CGL", "Combined Graduate Level exam preparation", "#3B82F6", ssc, aarav);
        Category sscChsl = cat("SSC CHSL", "Combined Higher Secondary Level exam notes", "#60A5FA", ssc, aarav);
        cat("SSC MTS", "Multi-Tasking Staff exam notes", "#2563EB", ssc, admin);
        cat("SSC GD", "General Duty Constable exam notes", "#38BDF8", ssc, admin);

        Category banking = cat("Banking", "IBPS, SBI, RBI and banking awareness notes", "#22C55E", null, admin);
        Category ibpsPo = cat("IBPS PO", "IBPS Probationary Officer exam materials", "#22C55E", banking, admin);

        Category railway = cat("Railway", "RRB NTPC, Group D, ALP exam study notes", "#F97316", null, admin);
        Category rrbNtpc = cat("RRB NTPC", "Railway Non-Technical Popular Categories notes", "#F97316", railway, admin);

        Category programming = cat("Programming", "Software engineering, algorithms, and languages", "#A855F7", null, admin);
        Category javaCat = cat("Java", "Core Java, OOP, Collections, JVM & Spring Boot", "#F97316", programming, priya);
        Category python = cat("Python", "Python programming, data science, and ML notes", "#EAB308", programming, priya);
        cat("C++", "C++ STL, memory management, and competitive coding", "#3B82F6", programming, priya);
        cat("JavaScript", "Modern ES6+, TypeScript, React, and Node.js", "#FACC15", programming, priya);

        Category maths = cat("Mathematics", "Pure mathematics, calculus, and quantitative aptitude", "#06B6D4", null, admin);
        Category quant = cat("Quantitative Aptitude", "Speed math, arithmetic, trigonometry, and geometry", "#06B6D4", maths, aarav);

        Category engineering = cat("Engineering", "B.Tech & GATE core engineering subjects", "#EF4444", null, admin);
        Category cse = cat("Computer Science", "Core CS theory, algorithms, and systems", "#EC4899", engineering, priya);
        Category dbms = cat("DBMS", "Database Management Systems, SQL, Normalization & ACID", "#14B8A6", cse, priya);
        Category os = cat("Operating System", "Processes, scheduling, deadlocks, and virtual memory", "#8B5CF6", cse, priya);

        Instant now = Instant.now();

        seedTextNote(
                "SSC CGL & CHSL Quantitative Aptitude Formula Handbook",
                "Complete revision sheet covering Percentage, Profit & Loss, Compound Interest, Trigonometry identities, Geometry theorems, and Mensuration shortcuts for SSC CGL Tier 1 & Tier 2.",
                "Quantitative Aptitude", "SSC Aspirants Collective", "Aarav Sharma",
                "ssc-cgl-quant-handbook.md",
                """
                # SSC CGL & CHSL Quantitative Aptitude Formula Handbook

                ## 1. Percentage & Successive Change
                - Net percentage change for two successive changes a% and b%: `a + b + (a * b) / 100`
                - Key fractions: 1/6 = 16.66%, 1/7 = 14.28%, 1/8 = 12.5%, 1/9 = 11.11%, 1/12 = 8.33%

                ## 2. Profit, Loss & Discount
                - Profit % = ((SP - CP) / CP) * 100
                - Relation between MP and CP: `CP / MP = (100 - Discount%) / (100 + Profit%)`

                ## 3. Trigonometry Identities
                - sin^2(theta) + cos^2(theta) = 1
                - sec^2(theta) - tan^2(theta) = 1
                - If sec(x) + tan(x) = k, then sec(x) - tan(x) = 1/k

                ## 4. Geometry Quick Theorems
                - Sum of interior angles of an n-sided polygon = (n - 2) * 180 degrees
                - Angle subtended by a chord at the center is twice the angle at the circumference.
                """,
                aarav, Set.of(ssc, sscCgl, sscChsl, maths, quant), now.minus(45, ChronoUnit.MINUTES), 124, 389
        );

        seedTextNote(
                "Java Object-Oriented Programming (OOP) & Collections Deep Dive",
                "Structured Java notes covering Encapsulation, Inheritance, Polymorphism, Abstraction, Interfaces vs Abstract Classes, Exception Handling, and Java 21 Collections Framework with code examples.",
                "Object-Oriented Programming", "NIT Prayagraj", "Priya Verma",
                "java-oop-complete-notes.md",
                """
                # Java Object-Oriented Programming (OOP) Deep Dive

                ## 1. Four Pillars of OOP
                1. **Encapsulation**: Bundling fields and methods inside a class and restricting direct access via `private` modifiers and getters/setters.
                2. **Inheritance**: Acquiring properties and behavior of a parent class using `extends`. Java supports single inheritance for classes and multiple inheritance via interfaces.
                3. **Polymorphism**: Compile-time polymorphism (method overloading) and runtime polymorphism (method overriding via dynamic method dispatch).
                4. **Abstraction**: Hiding implementation complexity using `abstract` classes and `interface` contracts.

                ## 2. Inheritance Example in Java
                ```java
                class Animal {
                    void sound() { System.out.println("Animal makes a sound"); }
                }
                class Dog extends Animal {
                    @Override
                    void sound() { System.out.println("Dog barks"); }
                }
                ```

                ## 3. Java Collections Hierarchy
                - `List`: ArrayList (O(1) random access), LinkedList (O(1) head/tail insertion)
                - `Set`: HashSet (O(1) average), LinkedHashSet (insertion order), TreeSet (sorted O(log n))
                - `Map`: HashMap, ConcurrentHashMap, TreeMap
                """,
                priya, Set.of(programming, javaCat, cse), now.minus(2, ChronoUnit.HOURS), 210, 542
        );

        seedTextNote(
                "DBMS B.Tech Complete Revision — Normalization, Indexing & ACID",
                "Semester and GATE-oriented DBMS notes covering ER Modeling, Relational Algebra, Functional Dependencies, 1NF to BCNF decomposition, B+ Trees, and Transaction Concurrency Control (2PL & MVCC).",
                "Database Management Systems", "NIT Prayagraj", "Priya Verma",
                "dbms-btech-complete-notes.md",
                """
                # DBMS Complete Revision Notes (B.Tech & GATE)

                ## 1. ACID Properties of Transactions
                - **Atomicity**: All operations succeed or none are applied (managed by Recovery Manager).
                - **Consistency**: Database moves from one valid state to another preserving constraints.
                - **Isolation**: Concurrent transactions execute without interfering (managed by Concurrency Control).
                - **Durability**: Committed changes survive power failures via Write-Ahead Logging (WAL).

                ## 2. Normal Forms
                - **1NF**: Atomic attribute values only; no multivalued attributes.
                - **2NF**: In 1NF + no partial dependency of non-prime attributes on a candidate key.
                - **3NF**: In 2NF + no transitive dependency (for X -> Y, X is superkey or Y is prime).
                - **BCNF**: For every non-trivial functional dependency X -> Y, X must be a superkey.

                ## 3. B+ Tree Indexing
                - All data pointers reside in leaf nodes; leaf nodes are linked sequentially for fast range scans.
                """,
                priya, Set.of(engineering, cse, dbms), now.minus(5, ChronoUnit.HOURS), 168, 412
        );

        seedTextNote(
                "Python Machine Learning Foundations — NumPy, Pandas & Scikit-Learn",
                "Practical handbook for Python ML workflows: vectorized NumPy arrays, Pandas dataframe transformations, Linear & Logistic Regression, Decision Trees, Cross-Validation, and Bias-Variance tradeoff.",
                "Machine Learning", "IIT Madras Online BS", "Priya Verma",
                "python-ml-foundations.md",
                """
                # Python Machine Learning Foundations

                ## 1. Supervised vs Unsupervised Learning
                - Supervised: Regression (continuous output) & Classification (discrete labels).
                - Unsupervised: Clustering (K-Means, DBSCAN) & Dimensionality Reduction (PCA).

                ## 2. Bias-Variance Tradeoff
                - High Bias -> Underfitting (model too simple).
                - High Variance -> Overfitting (model memorizes training noise).
                - Remedies: Regularization (L1 Lasso, L2 Ridge), k-fold Cross-Validation, more data.

                ## 3. Scikit-Learn Pipeline Example
                ```python
                from sklearn.pipeline import Pipeline
                from sklearn.preprocessing import StandardScaler
                from sklearn.linear_model import LogisticRegression

                pipe = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression())])
                ```
                """,
                priya, Set.of(programming, python, maths), now.minus(9, ChronoUnit.HOURS), 193, 476
        );

        seedTextNote(
                "Operating Systems — CPU Scheduling, Deadlocks & Virtual Memory",
                "Concise notes for B.Tech and GATE CS covering Process States, FCFS/SJF/SRTF/Round Robin scheduling, Banker's Algorithm for deadlock avoidance, Paging, TLB, and Page Replacement algorithms.",
                "Operating Systems", "Delhi Technological University", "Priya Verma",
                "operating-systems-revision.md",
                """
                # Operating Systems Revision Notes

                ## 1. CPU Scheduling Algorithms
                - **FCFS**: Non-preemptive; suffers from convoy effect.
                - **SJF / SRTF**: Optimal minimum average waiting time; may cause starvation.
                - **Round Robin**: Preemptive with time quantum q; ideal for time-sharing systems.

                ## 2. Four Necessary Conditions for Deadlock (Coffman)
                1. Mutual Exclusion
                2. Hold and Wait
                3. No Preemption
                4. Circular Wait

                ## 3. Virtual Memory & Paging
                - Effective Memory Access Time (EMAT) = `hit_ratio * (TLB + Mem) + (1 - hit_ratio) * (TLB + 2 * Mem)`
                - Belady's Anomaly occurs in FIFO page replacement, never in LRU or Optimal.
                """,
                priya, Set.of(engineering, cse, os), now.minus(16, ChronoUnit.HOURS), 141, 355
        );

        seedTextNote(
                "Banking & Railway General Awareness — RBI Monetary Policy & Static GK",
                "High-yield Banking Awareness and Indian Railways GK notes covering Repo Rate, Reverse Repo, CRR, SLR, Basel III norms, Indian Constitution articles, and RRB NTPC static science capsules.",
                "Banking & General Awareness", "All India Exam Forum", "Aarav Sharma",
                "banking-railway-awareness.txt",
                """
                BANKING & RAILWAY GENERAL AWARENESS NOTES
                ==========================================

                1. RBI MONETARY POLICY INSTRUMENTS
                - Repo Rate: Rate at which RBI lends short-term funds to commercial banks against government securities.
                - CRR (Cash Reserve Ratio): Minimum percentage of NDTL banks must keep as cash with RBI.
                - SLR (Statutory Liquidity Ratio): Percentage of NDTL banks maintain in liquid assets (gold, cash, G-secs).
                - OMO (Open Market Operations): Buying and selling of government securities by RBI to regulate liquidity.

                2. INDIAN RAILWAYS KEY FACTS (RRB NTPC)
                - First passenger train in India: Bombay (Bori Bunder) to Thane on 16 April 1853 (34 km).
                - Railway zones in India: 19 zones (including Metro Railway, Kolkata).
                - Dedicated Freight Corridors: Eastern DFC (Ludhiana to Dankuni) & Western DFC (Dadri to JNPT).
                """,
                aarav, Set.of(banking, ibpsPo, railway, rrbNtpc), now.minus(24, ChronoUnit.HOURS), 98, 287
        );

        log.info("NotesIndia demo seed completed successfully.");
    }

    private User createUser(String username, String email, String rawPassword, String fullName,
                            String bio, String institution, Role role) {
        User u = new User();
        u.setUsername(username);
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setFullName(fullName);
        u.setBio(bio);
        u.setInstitution(institution);
        u.setRole(role);
        u.setActive(true);
        return userRepository.save(u);
    }

    private Category cat(String name, String description, String color, Category parent, User creator) {
        return categoryService.findOrCreateEntity(
                name, description, color,
                parent != null ? parent.getId() : null,
                creator.getId(), true
        );
    }

    private void seedTextNote(
            String title, String description, String subject, String institution, String authorName,
            String filename, String content, User uploader, Set<Category> categories,
            Instant createdAt, long downloads, long views
    ) {
        byte[] bytes = content.stripIndent().getBytes(StandardCharsets.UTF_8);
        String ext = filename.endsWith(".md") ? "MD" : "TXT";
        String mime = filename.endsWith(".md") ? "text/markdown" : "text/plain";
        String storageKey = "seed/" + filename;

        storageService.store(storageKey, bytes, mime);

        Note note = new Note();
        note.setTitle(title);
        note.setDescription(description);
        note.setSubject(subject);
        note.setInstitution(institution);
        note.setAuthorName(authorName);
        note.setOriginalFilename(filename);
        note.setStorageKey(storageKey);
        note.setFileFormat(ext);
        note.setMimeType(mime);
        note.setFileSizeBytes(bytes.length);
        note.setFileChecksum(FileValidator.sha256(bytes));
        note.setUploadedBy(uploader);
        note.setCategories(new LinkedHashSet<>(categories));
        note.setStatus(NoteStatus.PUBLISHED);
        note.setDownloadCount(downloads);
        note.setViewCount(views);
        note.setCreatedAt(createdAt);
        noteRepository.save(note);
    }
}
