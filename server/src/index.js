const express = require('express');
const cors = require('cors');
const path = require('path');

const { authMiddleware } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Sistema de Asistencia STMC activo', version: '2.0.0' });
});

// Public enrollment form (no auth)
app.use('/api/enrollment', require('./routes/enrollment'));

// Auth
app.use('/api/auth', require('./routes/auth'));

// Protected API routes
app.use('/api/groups', authMiddleware, require('./routes/groups'));
app.use('/api/students', authMiddleware, require('./routes/students'));
app.use('/api/professors', authMiddleware, require('./routes/professors'));
app.use('/api/assistants', authMiddleware, require('./routes/assistants'));
app.use('/api/sessions', authMiddleware, require('./routes/sessions'));
app.use('/api/events', authMiddleware, require('./routes/events'));
app.use('/api/payroll', authMiddleware, require('./routes/payroll'));
app.use('/api/reports', authMiddleware, require('./routes/reports'));
app.use('/api/config', authMiddleware, require('./routes/config'));
app.use('/api/parent', authMiddleware, require('./routes/parent'));

// Serve React frontend in production
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
