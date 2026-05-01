# 🤖 AI Agent dengan Python Execution Capability

Sistem AI project Anda sudah di-upgrade menjadi **sophisticated AI Agent** yang bisa:
- ✅ **Analyze requests** secara intelligent
- ✅ **Generate Python code** secara otomatis
- ✅ **Execute Python** secara aman di server
- ✅ **Interpret results** dengan AI
- ✅ **Seamless integration** dengan chat interface

---

## 🚀 Fitur Utama

### 1. **Intelligent Request Routing**
AI Agent automatically decides:
- **Agent + Python**: Untuk data analysis, calculations, code generation
- **Regular Chat**: Untuk conversational queries

Triggers untuk agent execution:
- "analisis data", "hitung", "generate chart", "kode python"
- "statistik", "formula", "algoritma", "simulasi"
- "process file", "extract data", "batch operation"

### 2. **Safe Python Execution**
- 🔒 **Sandboxed execution** dengan timeout 30 detik
- 🚫 **Security filtering** (block exec, eval, subprocess, dll)
- 📊 **Output capture** maksimal 100KB
- ⏱️ **Timeout protection** prevents hanging
- 📚 **Library whitelist**: numpy, pandas, scipy, matplotlib, dll

### 3. **Execution Pipeline**
```
User Message
    ↓
[1] Analyze: Perlukah Python execution?
    ↓
[2] IF yes → Generate Python code
    ↓
[3] Execute code safely di server
    ↓
[4] Capture & interpret results
    ↓
[5] Format & return ke chat
```

---

## 💻 API Endpoints

### `/api/agent/execute` (Main Endpoint)
```bash
POST /api/agent/execute
Content-Type: application/json

{
  "message": "analisis dataset dengan 1000 baris data",
  "context": { /* optional */ }
}

Response:
{
  "success": true,
  "data": {
    "type": "execution|conversational|error",
    "thinking": "AI reasoning process",
    "code": "# Generated Python code",
    "pythonResult": { /* execution result */ },
    "enhancedResponse": "AI interpretation"
  }
}
```

### `/api/agent/analyze` 
Analyze if request needs execution:
```bash
POST /api/agent/analyze
{ "message": "user query" }
```

### `/api/agent/python-exec`
Execute Python code directly:
```bash
POST /api/agent/python-exec
{
  "code": "print(sum([1,2,3]))",
  "context": { /* optional */ }
}
```

### `/api/agent/history`
Get execution history:
```bash
GET /api/agent/history?limit=10
```

### `/api/agent/batch-exec`
Execute multiple scripts:
```bash
POST /api/agent/batch-exec
{
  "snippets": [
    { "label": "task1", "code": "print('Hello')" },
    { "label": "task2", "code": "print('World')" }
  ]
}
```

---

## 📚 Frontend Integration

### Option 1: Auto-Intelligent Routing
```javascript
import { agentIntegration } from './services/agentIntegration';

// This automatically decides: agent vs regular API
const response = await agentIntegration.sendMessageIntelligent(
  userMessage,
  conversationHistory,
  userLanguage,
  conversationId,
  personality,
  abortController,
  model
);
```

### Option 2: Direct Agent Execution
```javascript
import { agentService } from './services/agentService';

// Execute via agent explicitly
const result = await agentService.execute(
  "analisis data penjualan Q1",
  { /* context */ }
);
```

### Option 3: Direct Python Execution
```javascript
import { agentService } from './services/agentService';

// Direct Python code execution
const result = await agentService.executePython(
  `import numpy as np
   data = np.array([1,2,3,4,5])
   print(f"Mean: {data.mean()}")
   print(f"Std: {data.std()}")`
);
```

---

## 🔧 Configuration

### Server Setup (Node.js)

**Requirements:**
- Python 3.8+
- Node.js 16+
- Deepseek API key

**Installation:**
```bash
cd server
npm install  # If needed, add missing deps

# Required packages (check package.json):
# - express, cors, multer, node-fetch, etc
```

**Start server:**
```bash
npm run dev    # Development
npm start      # Production
```

### Environment Variables (.env)
```env
DEEPSEEK_API_KEY=your_key_here
VITE_API_BASE_URL=http://localhost:3001
```

---

## 📝 Usage Examples

### Example 1: Data Analysis
```
User: "Analisis data ini, hitung mean, median, std dev: [1,2,3,4,5,100]"

AI Agent akan:
1. Recognize: Data analysis needed
2. Generate Python code dengan numpy
3. Execute & capture hasil
4. Interpret: "Data distribution menunjukkan outlier di 100..."
```

### Example 2: Code Generation
```
User: "Generate quick sort algorithm dalam Python"

AI Agent akan:
1. Generate Python code
2. Execute untuk test
3. Return working code
```

### Example 3: Mathematical Calculation
```
User: "Solve persamaan: 2x^2 + 5x - 3 = 0"

AI Agent akan:
1. Generate code dengan sympy/numpy
2. Solve equation
3. Return hasil + explanation
```

---

## 🛡️ Security & Best Practices

### What's Allowed ✅
- Data processing (numpy, pandas)
- Mathematical calculations
- String manipulation
- JSON parsing
- Regular expressions
- Simple file reading (from context)
- Basic HTTP requests (requests library)

### What's Blocked ❌
- File system access (no open(), no file writing)
- System commands (no os.system, subprocess)
- Network access (except whitelisted requests)
- Multi-threading
- Code injection (exec, eval, compile)
- Dynamic imports (__import__)

### Best Practices 📋
1. **Keep code simple** - Complex logic = slower execution
2. **Use libraries from whitelist** - Avoid exotic packages
3. **Add timeouts** - Long-running = auto-killed after 30s
4. **Test locally first** - Use direct `/python-exec` endpoint
5. **Monitor execution time** - Optimize if possible

---

## 🐛 Troubleshooting

### "Python not found" Error
- Ensure Python 3.8+ installed
- Check: `python --version` or `python3 --version`
- Update PATH if needed

### "Code too large" Error
- Max code size: 50KB
- Split into smaller functions
- Use libraries for complex operations

### Timeout Issues (>30s)
- Code is too complex
- Simplify algorithm or use vectorization
- Break into smaller batches

### Import Errors
- Check if library is in whitelist
- Try alternative libraries
- Use only: numpy, pandas, scipy, matplotlib, scikit-learn

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React)                       │
│  ChatBot.jsx → agentIntegration.js → agentService.js   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP POST /api/agent/*
                     ↓
┌─────────────────────────────────────────────────────────┐
│              Express Server (Node.js)                   │
│  routes/agent.js → agentService.js                      │
│                 ↓                                        │
│          - Analyze request                              │
│          - Generate Python code                         │
│          - Validate security                            │
└────────────────────┬────────────────────────────────────┘
                     │ spawn() Python process
                     ↓
┌─────────────────────────────────────────────────────────┐
│         Python Sandbox (pythonExecutor.js)              │
│  - Timeout: 30s  - Output cap: 100KB                    │
│  - Whitelist libs - Security filtering                  │
│  - Returns: {success, output, error, time}              │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Performance Notes

- **Agent Analysis**: ~500-1000ms (API call)
- **Code Generation**: ~1000-2000ms (API call)
- **Python Execution**: Varies (typically 100-5000ms)
- **Total Overhead**: ~2-10 seconds per request

### Optimization Tips:
1. Reuse context between requests
2. Use batch execution for multiple tasks
3. Cache common calculations
4. Limit output size
5. Use vectorized operations (numpy, pandas)

---

## 📮 Next Steps

1. **Test agent endpoints** directly with curl/Postman
2. **Integrate into ChatBot** via agentIntegration.js
3. **Monitor execution times** in production
4. **Collect user feedback** on accuracy
5. **Fine-tune keywords** for better routing

---

**Build powerful AI agents! 🚀**
