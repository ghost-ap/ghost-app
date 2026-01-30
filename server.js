// server.js - الإصدار النهائي المتوافق مع تصميم Ghost الجديد
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// الإعدادات من ملف .env أو قيم افتراضية
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://adam:adam735599881@adam.hll7bsx.mongodb.net/GhostApp?retryWrites=true&w=majority";
const JWT_SECRET = process.env.JWT_SECRET || "ADam735599881_Ghost_Secret_2026";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "adam735599881";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "@ADam735599881@ADam735599881@";

// البرمجيات الوسيطة (Middleware)
app.use(helmet({ contentSecurityPolicy: false })); // لضمان عمل واجهة الـ CDN
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تحديد عدد الطلبات لحماية السيرفر
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// الاتصال بـ MongoDB Atlas
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas (GhostApp)'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// تعريف نموذج المستخدم (User Schema)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    points: { type: Number, default: 0 },
    isSharing: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// --- المسارات (Routes) ---

// 1. تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: "تم إنشاء الحساب بنجاح" });
        } catch (error) {
        res.status(400).json({ error: "اسم المستخدم موجود مسبقاً" });
        }
});

// 2. تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // التحقق إذا كان المدير هو من يدخل
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            const token = jwt.sign({ username, isAdmin: true }, JWT_SECRET);
            return res.json({ token, isAdmin: true, username });
            }

        const user = await User.findOne({ username });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: "بيانات الدخول خاطئة" });
        }
        
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET);
        res.json({ token, points: user.points, username: user.username });
        } catch (error) {
        res.status(500).json({ error: "خطأ في الخادم" });
        }
        });

// 3. جلب بيانات المستخدم
app.get('/api/user/status', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        res.json({ points: user.points, isSharing: user.isSharing });
    } catch (error) {
        res.status(401).json({ error: "غير مصرح" });
    }
});

// تشغيل السيرفر
server.listen(PORT, () => {
    console.log('==============================================');
    console.log(`🚀 Ghost server running on port ${PORT}`);
    console.log(`👑 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔗 Web Interface: http://localhost:${PORT}`);
    console.log('==============================================');
});

// إدارة اتصالات Socket.io لمشاركة البيانات
io.on('connection', (socket) => {
    socket.on('startSharing', async (data) => {
        // منطق إضافة النقاط عند مشاركة الإنترنت
        console.log(`User ${data.username} started sharing...`);
    });
});