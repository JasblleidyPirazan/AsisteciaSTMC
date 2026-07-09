const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Validate required environment variables before starting
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Error: Variable de entorno requerida faltante: ${key}`);
    process.exit(1);
  }
}

const { authMiddleware } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS — allow all origins since auth uses JWT (not cookies), so CSRF is not a threat.
// Same-origin requests from Railway domain always work; this also allows API testing tools.
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Sistema de Asistencia STMC activo', version: '2.0.0' });
});

// Public enrollment routes (rate limiting applied per-route inside the router)
app.use('/api/enrollment', require('./routes/enrollment'));

// Auth (rate-limited on login)
app.use('/api/auth', authLimiter, require('./routes/auth'));

// Protected API routes
app.use('/api/groups', authMiddleware, require('./routes/groups'));
app.use('/api/students', authMiddleware, require('./routes/students'));
app.use('/api/professors', authMiddleware, require('./routes/professors'));
app.use('/api/assistants', authMiddleware, require('./routes/assistants'));
app.use('/api/sessions', authMiddleware, require('./routes/sessions'));
app.use('/api/makeups', authMiddleware, require('./routes/makeups'));
app.use('/api/events', authMiddleware, require('./routes/events'));
app.use('/api/payroll', authMiddleware, require('./routes/payroll'));
app.use('/api/reports', authMiddleware, require('./routes/reports'));
app.use('/api/config', authMiddleware, require('./routes/config'));
app.use('/api/semesters', authMiddleware, require('./routes/semesters'));
app.use('/api/parent', authMiddleware, require('./routes/parent'));
app.use('/api/users', authMiddleware, require('./routes/users'));

// Serve React frontend
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎾 Servidor STMC corriendo en puerto ${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
});
