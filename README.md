# Orion AI - React Chatbot Application

Aplikasi chatbot modern yang dibangun dengan React dan Vite, mengintegrasikan Orion AI dengan model deepernova_id1_ (912 Miliar Parameter) untuk memberikan kecerdasan buatan pada percakapan.

## Fitur

- 💬 Real-time chat interface dengan UI yang modern dan responsif
- 🤖 Orion AI dengan model deepernova_id1_ (912 Miliar Parameter)
- ⚡ Built dengan Vite untuk performa maksimal
- 📱 Responsive design yang mobile-friendly
- 🎨 Beautiful gradient UI dengan animasi smooth
- 🔄 Real-time typing indicator
- 📝 Message history dalam satu session

## Prerequisite

- Node.js (v16 atau lebih tinggi)
- npm atau yarn
- Deepseek API Key dari https://platform.deepseek.com/

## Installation

1. Clone atau buka project ini
2. Install dependencies:
```bash
npm install
```

3. Setup environment variables:
   - Buat file `.env` di root directory
   - Copy isi dari `.env.example`
   - Ganti `your-api-key-here` dengan Deepseek API key Anda:
```
VITE_DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

## Running the Application

### Development Mode
```bash
npm run dev
```
Server akan berjalan di `http://localhost:5173`

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── ChatBot.jsx       # Main chatbot component
│   └── ChatBot.css       # Chatbot styling
├── services/
│   └── grokApi.js        # Deepseek API integration
├── App.jsx               # Root component
├── App.css               # App styling
└── main.jsx              # Entry point
```

## Configuration

### API Endpoint
- **URL**: `https://api.deepseek.com/chat/completions`
- **Model**: `deepseek-chat`
- **Method**: POST

### Environment Variables
- `VITE_DEEPSEEK_API_KEY` - Deepseek API authentication key

## How It Works

1. User mengetik pesan di input field
2. Pesan dikirim ke Deepseek API melalui service layer
3. Bot menampilkan typing indicator sambil menunggu response
4. Response dari Deepseek ditampilkan sebagai bot message
5. Conversation history ditampilkan dalam message container

## Troubleshooting

### API Key Error
- Pastikan `.env` file sudah dibuat dengan format yang benar
- Periksa bahwa API key valid dan tidak expired
- Cek Deepseek console untuk quota usage

### Network Error
- Verifikasi internet connection
- Pastikan API endpoint dapat diakses
- Check browser console untuk error details

### Message Not Sending
- Pastikan input tidak kosong
- Tunggu previous message selesai diproses
- Periksa network tab di developer tools

## Technologies

- **Frontend Framework**: React 19
- **Build Tool**: Vite 8
- **CSS**: Modern CSS3 dengan Flexbox dan Grid
- **HTTP Client**: Fetch API
- **Environment**: Node.js

## Performance

- ⚡ **Dev Mode**: ~1 second startup
- 🔧 **HMR**: Instant hot module replacement
- 📦 **Production Build**: Optimized & minified
- 💾 **Bundle Size**: ~150KB (gzipped)

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit `.env` file ke repository
- Keep your API key private and secure
- Use `.env.local` untuk local testing
- Regenerate API key jika telah di-expose

## Future Enhancements

- [ ] Message persistence dengan localStorage
- [ ] Copy to clipboard untuk messages
- [ ] Multiple conversation threads
- [ ] Export chat history
- [ ] Dark mode toggle
- [ ] Voice input/output
- [ ] Message search functionality
- [ ] User authentication

## License

MIT

## Support

Untuk pertanyaan atau issues, silakan buat issue di repository atau hubungi tim development.

---

**Note**: Pastikan `.env` file sudah dikonfigurasi dengan Deepseek API key yang valid. Orion AI menggunakan Deepseek API backend dengan custom branding dan system prompt.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
