// Sample exam for the pipeline demo: one paper with 10 topics. Each of 10 setters writes ONE multiple-choice question for EVERY
// topic (so each setter's file has 10 questions, and each topic has 10 candidate questions, one from each setter).
// Topics are university CS core subjects. All questions are ordinary textbook material: nothing here is a real exam paper.
// Each row is [question, correct answer, wrong, wrong, wrong]. Options are shuffled once, deterministically, below.
import LP from './logic.mjs';

const RAW = {  // topic -> its ten questions; question j is written by setter j
  'Data Structures': [
    ['Which structure gives O(1) average-time insert and lookup by key?', 'Hash table', 'Binary search tree', 'Linked list', 'Sorted array'],
    ['Worst-case search time in an unbalanced binary search tree with n nodes?', 'O(n)', 'O(1)', 'O(log n)', 'O(n log n)'],
    ['Which data structure does breadth-first search use?', 'Queue', 'Stack', 'Heap', 'Trie'],
    ['An inorder traversal of a binary search tree visits keys in what order?', 'Sorted order', 'Random order', 'Reverse level order', 'Insertion order'],
    ['The height of a complete binary tree with n nodes is:', 'Θ(log n)', 'Θ(n)', 'Θ(√n)', 'Θ(n log n)'],
    ['Which operation takes O(1) on a singly linked list?', 'Insert at the head', 'Search for a value', 'Delete the last node', 'Reverse the list'],
    ['In a max-heap, the largest element is at:', 'The root', 'A leaf', 'The middle level', 'Any position'],
    ['A stack follows which discipline?', 'Last in, first out', 'First in, first out', 'Priority order', 'Random order'],
    ['Which hash-collision method keeps colliding keys in a linked list?', 'Chaining', 'Linear probing', 'Double hashing', 'Cuckoo hashing'],
    ['A binary tree of height h (counted in edges) has at least how many nodes?', 'h + 1', 'h', '2h', '2^h'],
  ],
  'Operating Systems': [
    ['Which scheduling policy can starve long jobs?', 'Shortest job first', 'Round robin', 'First come first served', 'Multilevel queue with aging'],
    ['A process in the ready state is waiting for:', 'The CPU', 'An I/O device', 'A signal', 'More memory'],
    ['Which is NOT a necessary condition for deadlock?', 'Preemption of resources', 'Mutual exclusion', 'Hold and wait', 'Circular wait'],
    ['A page fault occurs when:', 'The page is not in main memory', 'The page is in the TLB', 'The disk is full', 'The CPU is idle'],
    ['A semaphore initialised to 1 behaves like a:', 'Mutex lock', 'Page table', 'Timer', 'Counter of CPUs'],
    ['Thrashing is mainly caused by:', 'Excessive paging', 'Too few processes', 'A large cache', 'A fast disk'],
    ['A context switch saves a process\'s state in its:', 'Process control block', 'Page table only', 'Heap', 'Boot sector'],
    ['Which allocation scheme suffers external fragmentation?', 'Contiguous variable-size partitions', 'Fixed-size paging', 'TLB caching', 'Demand paging'],
    ['In the child process, fork() returns:', '0', 'The child\'s PID', '-1', 'The parent\'s PID'],
    ['Belady\'s anomaly can occur with which page replacement policy?', 'FIFO', 'LRU', 'Optimal', 'Second-chance with reference bits only'],
  ],
  'Databases': [
    ['Which normal form removes partial dependencies?', 'Second normal form', 'First normal form', 'Third normal form', 'Fourth normal form'],
    ['Which SQL clause filters groups after aggregation?', 'HAVING', 'WHERE', 'GROUP BY', 'ORDER BY'],
    ['In ACID, the letter I stands for:', 'Isolation', 'Integrity', 'Indexing', 'Inheritance'],
    ['A primary key must be:', 'Unique and not null', 'Unique but may be null', 'Not unique', 'Always numeric'],
    ['Which join keeps every row of the left table?', 'Left outer join', 'Inner join', 'Cross join', 'Natural join'],
    ['An index on a column mainly speeds up:', 'Lookups and range scans', 'Inserts', 'Table creation', 'Backups'],
    ['Two-phase locking guarantees:', 'Conflict serializability', 'Freedom from deadlock', 'No aborts', 'Faster reads'],
    ['A foreign key enforces:', 'Referential integrity', 'Sort order', 'Encryption', 'Caching'],
    ['Which relational algebra operator selects rows?', 'σ (sigma)', 'π (pi)', '⋈ (join)', '∪ (union)'],
    ['Write-ahead logging helps a database recover with:', 'Durability and atomicity', 'Smaller tables', 'Faster queries', 'Automatic indexes'],
  ],
  'Computer Networks': [
    ['TCP provides:', 'A reliable ordered byte stream', 'Unreliable datagrams', 'Only routing', 'Only name lookup'],
    ['Which layer does IP belong to?', 'Network layer', 'Transport layer', 'Link layer', 'Application layer'],
    ['The default port for HTTPS is:', '443', '80', '22', '53'],
    ['DNS translates:', 'Names to IP addresses', 'IP addresses to MAC addresses', 'Ports to processes', 'URLs to files'],
    ['The TCP three-way handshake is:', 'SYN, SYN-ACK, ACK', 'ACK, ACK, FIN', 'SYN, SYN, ACK', 'HELLO, OK, BYE'],
    ['Which device forwards packets by IP address?', 'Router', 'Hub', 'Repeater', 'Layer-2 switch'],
    ['ARP maps:', 'IP addresses to MAC addresses', 'MAC addresses to IP addresses', 'Ports to processes', 'Names to IP addresses'],
    ['How many addresses are in a /24 IPv4 block?', '256', '24', '128', '1024'],
    ['Which protocol is connectionless?', 'UDP', 'TCP', 'TLS', 'SSH'],
    ['TLS mainly provides:', 'An encrypted, authenticated channel', 'Routing', 'Addressing', 'Compression only'],
  ],
  'Algorithms': [
    ['Merge sort\'s worst-case running time is:', 'O(n log n)', 'O(n)', 'O(n²)', 'O(log n)'],
    ['Binary search requires the input to be:', 'Sorted', 'In a hash table', 'A heap', 'A graph'],
    ['Dijkstra\'s algorithm can fail when the graph has:', 'Negative edge weights', 'Cycles', 'Sparse edges', 'Directed edges'],
    ['Which of these is a greedy algorithm?', 'Kruskal\'s minimum spanning tree', 'Floyd–Warshall', 'Matrix-chain multiplication', 'Longest common subsequence'],
    ['The recurrence T(n) = 2T(n/2) + n solves to:', 'Θ(n log n)', 'Θ(n)', 'Θ(n²)', 'Θ(log n)'],
    ['Dynamic programming relies on:', 'Overlapping subproblems and optimal substructure', 'Randomness', 'Sorting the input', 'Limited recursion depth'],
    ['Quicksort\'s worst case occurs when the pivot is:', 'Always the minimum or maximum', 'The median', 'Chosen at random', 'Chosen from a sorted prefix of size 3'],
    ['Topological sorting applies to:', 'Directed acyclic graphs', 'Any graph', 'Undirected graphs', 'Complete graphs'],
    ['Bellman–Ford runs in time:', 'O(VE)', 'O(V + E)', 'O(E log V)', 'O(V³)'],
    ['Which problem is NP-complete?', '3-SAT', 'Sorting', 'Shortest path', 'Binary search'],
  ],
  'Discrete Mathematics': [
    ['How many subsets does a set of n elements have?', '2^n', 'n²', 'n!', '2n'],
    ['A relation that is reflexive, symmetric and transitive is:', 'An equivalence relation', 'A partial order', 'A function', 'A bijection'],
    ['In a graph with e edges, the degrees sum to:', '2e', 'e', 'e²', 'e/2'],
    ['¬(p ∧ q) is equivalent to:', '¬p ∨ ¬q', '¬p ∧ ¬q', 'p ∨ q', 'p → q'],
    ['In how many ways can 4 distinct books be arranged on a shelf?', '24', '4', '16', '12'],
    ['A tree with n vertices has how many edges?', 'n − 1', 'n', 'n + 1', '2n'],
    ['gcd(12, 18) =', '6', '3', '9', '12'],
    ['By the pigeonhole principle, among 13 people two share:', 'A birth month', 'A birthday', 'A first name', 'A height'],
    ['C(5, 2) =', '10', '5', '20', '25'],
    ['A proof by induction needs:', 'A base case and an inductive step', 'Only a base case', 'Only a counterexample', 'A contradiction'],
  ],
  'Probability and Statistics': [
    ['For mutually exclusive events, P(A ∪ B) =', 'P(A) + P(B)', 'P(A) · P(B)', 'P(A) − P(B)', '1'],
    ['The expected value of a fair six-sided die is:', '3.5', '3', '4', '6'],
    ['Variance measures a distribution\'s:', 'Spread', 'Centre', 'Skew', 'Sample size'],
    ['If A and B are independent, P(A ∩ B) =', 'P(A) · P(B)', 'P(A) + P(B)', 'P(A | B)', '0'],
    ['The standard normal distribution has mean and standard deviation:', '0 and 1', '1 and 0', '0 and 0', '1 and 1'],
    ['Bayes\' theorem relates:', 'P(A | B) and P(B | A)', 'Mean and mode', 'Sample and population', 'Variance and range'],
    ['The probability of two heads in two fair coin tosses is:', '1/4', '1/2', '1/3', '3/4'],
    ['The median of 1, 3, 5, 7, 9 is:', '5', '3', '7', '25'],
    ['The central limit theorem says sample means tend to follow a:', 'Normal distribution', 'Uniform distribution', 'Constant', 'Exponential distribution'],
    ['A correlation coefficient of +1 means:', 'A perfect positive linear relationship', 'No relationship', 'A perfect negative relationship', 'Causation'],
  ],
  'Linear Algebra': [
    ['The determinant of the 2×2 identity matrix is:', '1', '0', '2', '−1'],
    ['If A is m×n, the product AB is defined when B is:', 'n×p', 'm×p', 'p×m', 'n×n only'],
    ['An eigenvalue λ of A satisfies:', 'Av = λv for some nonzero v', 'A = λ', 'det(A) = λ', 'A² = I'],
    ['The rank of the 3×3 identity matrix is:', '3', '1', '2', '0'],
    ['Vectors are linearly independent when:', 'Only the trivial combination gives zero', 'They are equal', 'They are all orthogonal', 'They have the same length'],
    ['(AB)ᵀ equals:', 'BᵀAᵀ', 'AᵀBᵀ', 'ABᵀ', 'A⁻¹B⁻¹'],
    ['A square matrix is invertible if and only if:', 'Its determinant is not zero', 'Its trace is zero', 'It is symmetric', 'All entries are positive'],
    ['The dot product of two orthogonal vectors is:', '0', '1', '−1', 'Their length'],
    ['The dimension of ℝ³ is:', '3', '1', '2', '4'],
    ['The trace of a matrix is:', 'The sum of its diagonal entries', 'The product of its diagonal entries', 'Its determinant', 'Its rank'],
  ],
  'Computer Architecture': [
    ['Caches work because programs show:', 'Locality of reference', 'Pipelining', 'Virtual memory', 'Interrupts'],
    ['Which is the fastest storage?', 'A CPU register', 'L2 cache', 'Main memory', 'An SSD'],
    ['A data hazard in a pipeline arises from:', 'Dependent instructions', 'A power cut', 'A cache hit', 'A page fault'],
    ['RISC processors typically have:', 'Simple, fixed-length instructions', 'Variable, complex instructions', 'No registers', 'Only microcode'],
    ['Virtual memory maps:', 'Virtual addresses to physical addresses', 'Bits to bytes', 'Registers to the ALU', 'Disk blocks to cache lines only'],
    ['Amdahl\'s law limits speed-up by the:', 'Serial fraction of the program', 'Clock speed', 'Cache size', 'Word length'],
    ['The 4-bit two\'s complement of 0101 is:', '1011', '1010', '0110', '1111'],
    ['Which register holds the address of the next instruction?', 'Program counter', 'Accumulator', 'Stack pointer', 'Status register'],
    ['A direct-mapped cache places each memory block in:', 'Exactly one cache line', 'Any cache line', 'A set of four lines', 'No fixed line'],
    ['DMA lets a device:', 'Transfer data without the CPU copying each byte', 'Execute programs', 'Replace the operating system', 'Compress data'],
  ],
  'Software Engineering': [
    ['Unit tests check:', 'Small parts in isolation', 'The whole system', 'User acceptance', 'Network speed'],
    ['Which of these is a design pattern?', 'Observer', 'Quicksort', 'TCP', 'B-tree'],
    ['Agile methods favour:', 'Working software and frequent feedback', 'Exhaustive upfront documents', 'Fixed contracts', 'One big release'],
    ['Version control mainly helps with:', 'Tracking changes and collaborating', 'Compiling code', 'Encrypting code', 'Testing hardware'],
    ['Regression testing checks that:', 'Old features still work after a change', 'The new colours look right', 'Compilation is fast', 'The network is fast'],
    ['Good module design aims for:', 'Low coupling and high cohesion', 'High coupling', 'Circular dependencies', 'Large shared globals'],
    ['Code review mainly improves:', 'Quality and shared knowledge', 'Compile time', 'Disk usage', 'Bandwidth'],
    ['Black-box testing uses:', 'Inputs and expected outputs only', 'Internal branches', 'Compiler flags', 'Memory maps'],
    ['Technical debt is:', 'Shortcuts that cost extra effort later', 'Unpaid server bills', 'Unused hardware', 'Hardware faults'],
    ['Continuous integration means:', 'Merging and testing code frequently', 'Running servers non-stop', 'Reviewing code once a year', 'Indexing source files'],
  ],
};

export const TOPICS = Object.keys(RAW);
export const SETTER_COUNT = 10;
export const SETTERS = Array.from({ length: SETTER_COUNT }, (_, i) => ({ id: 'S' + String(i + 1).padStart(2, '0'), name: 'Setter ' + String(i + 1).padStart(2, '0') }));
export const EXAM = { title: 'B.Tech CS core, mid-semester paper', topics: TOPICS.length, perTopic: 1 };

/** All 100 questions. Options are shuffled once per question, from its id, so the right answer's place varies but never changes. */
export const QUESTIONS = TOPICS.flatMap((topic, t) => RAW[topic].map((row, j) => {
  const id = `T${String(t + 1).padStart(2, '0')}-${SETTERS[j].id}`;
  const [text, right, ...wrong] = row;
  const options = LP.shuffle([right, ...wrong], LP.rngFrom('options|' + id));
  return { id, topic, topicIndex: t, setter: SETTERS[j].id, setterName: SETTERS[j].name, text, options, correct: options.indexOf(right) };
}));
export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

/** What each setter hands in: one file with one question per topic. */
export const FILES = SETTERS.map((st) => ({ file: `setter-${st.id.slice(1)}.json`, setter: st.id, setterName: st.name, questions: QUESTIONS.filter((q) => q.setter === st.id) }));
