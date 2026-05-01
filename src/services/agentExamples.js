/**
 * Agent Testing & Examples
 * Run these in your browser console or as standalone Node script
 * 
 * Usage in browser:
 * 1. Open DevTools (F12)
 * 2. Paste code from relevant example
 * 3. Check console for output
 */

// ============================================
// EXAMPLE 1: Simple Data Analysis via Agent
// ============================================
async function example_dataAnalysis() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const result = await agentService.execute(
    "Analisis data penjualan ini: [100, 250, 180, 320, 290, 410, 150]. " +
    "Hitung: mean, median, std deviation, dan identifikasi trend."
  );
  
  console.log('=== Data Analysis Result ===');
  console.log('Type:', result.type);
  console.log('Thinking:', result.thinking);
  if (result.code) console.log('Generated Code:', result.code);
  if (result.pythonResult) {
    console.log('Python Output:', result.pythonResult.output);
    console.log('Execution Time:', result.pythonResult.executionTime, 'ms');
  }
  console.log('Enhanced Response:', result.enhancedResponse);
}

// ============================================
// EXAMPLE 2: Python Code Generation
// ============================================
async function example_codeGeneration() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const result = await agentService.execute(
    "Generate Python code untuk quick sort algorithm. " +
    "Include test dengan array: [64, 34, 25, 12, 22, 11, 90]"
  );
  
  console.log('=== Code Generation Result ===');
  console.log('Generated Code:\n', result.code);
  console.log('Output:\n', result.pythonResult?.output);
}

// ============================================
// EXAMPLE 3: Mathematical Calculation
// ============================================
async function example_mathCalculation() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const result = await agentService.execute(
    "Solve quadratic equation: 2x^2 + 5x - 3 = 0. " +
    "Gunakan Python dengan numpy/scipy jika perlu."
  );
  
  console.log('=== Math Calculation Result ===');
  console.log('Code:', result.code);
  console.log('Result:', result.pythonResult?.output);
  console.log('Interpretation:', result.enhancedResponse);
}

// ============================================
// EXAMPLE 4: Direct Python Execution
// ============================================
async function example_directPythonExec() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const code = `
import numpy as np
from statistics import mean, median, stdev

data = [100, 250, 180, 320, 290, 410, 150]
print(f"Data: {data}")
print(f"Mean: {mean(data):.2f}")
print(f"Median: {median(data):.2f}")
print(f"Std Dev: {stdev(data):.2f}")
print(f"Min: {min(data)}, Max: {max(data)}")
`;

  const result = await agentService.execute(
    "Execute this Python code: " + code
  );
  
  console.log('=== Direct Python Execution ===');
  console.log(result.pythonResult?.output);
  console.log('Success:', result.pythonResult?.success);
  console.log('Time:', result.pythonResult?.executionTime, 'ms');
}

// ============================================
// EXAMPLE 5: File Processing Simulation
// ============================================
async function example_fileProcessing() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const csvData = `name,age,score
Alice,25,85
Bob,30,90
Charlie,22,78
Diana,28,92
Eve,26,88`;

  const result = await agentService.execute(
    "Parse CSV data dan hitung statistik umur dan score: " + csvData
  );
  
  console.log('=== File Processing ===');
  console.log('Output:', result.pythonResult?.output);
}

// ============================================
// EXAMPLE 6: Conversational (No Code Needed)
// ============================================
async function example_conversational() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const result = await agentService.execute(
    "Apa itu machine learning? Jelaskan secara singkat."
  );
  
  console.log('=== Conversational Query ===');
  console.log('Type:', result.type);
  console.log('Thinking:', result.thinking);
  console.log('Response:', result.response);
}

// ============================================
// EXAMPLE 7: Request Analysis Only
// ============================================
async function example_requestAnalysis() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const analysis = await agentService.analyze(
    "Hitung persentase pertumbuhan dari Q1 ke Q2"
  );
  
  console.log('=== Request Analysis ===');
  console.log('Needs Execution:', analysis.needsExecution);
  console.log('Category:', analysis.category);
  console.log('Confidence:', analysis.confidence);
  console.log('Thinking:', analysis.thinking);
}

// ============================================
// EXAMPLE 8: Batch Execution
// ============================================
async function example_batchExecution() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const snippets = [
    {
      label: "fibonacci",
      code: `
def fib(n):
    if n <= 1: return n
    return fib(n-1) + fib(n-2)

result = [fib(i) for i in range(10)]
print(f"Fibonacci: {result}")
`
    },
    {
      label: "prime_check",
      code: `
def is_prime(n):
    if n < 2: return False
    for i in range(2, int(n**0.5)+1):
        if n % i == 0: return False
    return True

primes = [i for i in range(20) if is_prime(i)]
print(f"Primes < 20: {primes}")
`
    }
  ];

  const results = await agentService.batchExecute(snippets);
  
  console.log('=== Batch Execution Results ===');
  results.forEach(r => {
    console.log(`\n${r.label}:`);
    console.log('Output:', r.output);
    console.log('Success:', r.success);
  });
}

// ============================================
// EXAMPLE 9: Execution History
// ============================================
async function example_executionHistory() {
  const agentService = (await import('./services/agentService.js')).default;
  
  // Run a few executions first
  await agentService.execute("Calculate 2+2");
  await agentService.execute("hitung factorial 5");
  
  // Get history
  const history = agentService.getHistory(5);
  
  console.log('=== Execution History ===');
  console.log('Total recorded:', history.length);
  history.forEach((item, idx) => {
    console.log(`${idx+1}. "${item.userMessage.substring(0, 50)}..."`);
    console.log('   Time:', new Date(item.timestamp).toLocaleString());
    console.log('   Success:', item.success);
  });
}

// ============================================
// EXAMPLE 10: Agent with Context
// ============================================
async function example_agentWithContext() {
  const agentService = (await import('./services/agentService.js')).default;
  
  const context = {
    company: "PT Maju Jaya",
    year: 2024,
    q1_sales: 1000000,
    q2_sales: 1250000,
    q3_sales: 1500000
  };
  
  const result = await agentService.execute(
    "Analisis pertumbuhan penjualan kuartalan dan hitung proyeksi Q4. " +
    "Gunakan data context yang disediakan.",
    context
  );
  
  console.log('=== Agent with Context ===');
  console.log('Context:', context);
  console.log('Analysis:', result.pythonResult?.output);
  console.log('Interpretation:', result.enhancedResponse);
}

// ============================================
// TEST RUNNER
// ============================================
async function runAllExamples() {
  console.clear();
  console.log('🚀 Starting Agent Examples Test Suite\n');
  
  try {
    console.log('1️⃣  Data Analysis...');
    await example_dataAnalysis();
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('\n2️⃣  Code Generation...');
    await example_codeGeneration();
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('\n3️⃣  Math Calculation...');
    await example_mathCalculation();
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('\n4️⃣  Direct Python Execution...');
    await example_directPythonExec();
    
    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('❌ Error in test suite:', error);
  }
}

// ============================================
// Quick Test Function
// ============================================
async function quickTest(message) {
  const agentService = (await import('./services/agentService.js')).default;
  const result = await agentService.execute(message);
  console.log('Result:', result);
  return result;
}

// ============================================
// EXPORT FOR USE
// ============================================
window.agentExamples = {
  example_dataAnalysis,
  example_codeGeneration,
  example_mathCalculation,
  example_directPythonExec,
  example_fileProcessing,
  example_conversational,
  example_requestAnalysis,
  example_batchExecution,
  example_executionHistory,
  example_agentWithContext,
  runAllExamples,
  quickTest
};

console.log('✅ Agent Examples loaded!');
console.log('Available functions:');
console.log('- agentExamples.quickTest("your message")');
console.log('- agentExamples.example_dataAnalysis()');
console.log('- agentExamples.example_codeGeneration()');
console.log('- agentExamples.runAllExamples()');
console.log('- ... and more! Check agentExamples object');
