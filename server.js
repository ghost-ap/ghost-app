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
const crypto = require('crypto'); const uuidv4 = () => crypto.randomUUID();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// الإعدادات من ملف .env أو قيم افتراضية
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://ghost_admin:cwBpDNVigRWdm5ad@adam.hll7bsx.mongodb.net/ghost_db?retryWrites=true&w=majority";
const JWT_SECRET = process.env.JWT_SECRET || "ADam735599881_Ghost_Secret_Key_2026";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@2026";

// البرمجيات الوسيطة (Middleware)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تحديد عدد الطلبات لحماية السيرفر
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests from this IP, please try again later." }
});
app.use('/api/', limiter);

// الاتصال بـ MongoDB Atlas
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB Atlas (ghost_db)'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// تعريف نماذج MongoDB
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    points: { type: Number, default: 0 },
    actualPoints: { type: Number, default: 0 }, // النقاط الحقيقية
    sharedData: { type: Number, default: 0 }, // GB
    connectionTime: { type: Number, default: 0 }, // دقائق
    isSharing: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    totalReferrals: { type: Number, default: 0 },
    referralBonus: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const withdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, required: true },
    points: { type: Number, required: true },
    amount: { type: Number, required: true }, // المبلغ الحقيقي
    displayAmount: { type: Number, required: true }, // المبلغ المعروض (25%)
    method: { type: String, enum: ['paypal', 'bank', 'crypto'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    transactionId: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date }
});

const User = mongoose.model('User', userSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

// توليد كود إحالة عشوائي
function generateReferralCode() {
    return 'GHOST' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- المسارات (Routes) ---

// 1. تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, referralCode } = req.body;
        
        // التحقق من صحة البيانات
        if (!username || !password) {
            return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
        }
        
        // التحقق من عدم وجود مستخدم بنفس الاسم
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "اسم المستخدم موجود مسبقاً" });
        }
        
        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);
        const userReferralCode = generateReferralCode();
        
        // إنشاء المستخدم
        const user = new User({
            username,
                password: hashedPassword,
                referralCode: userReferralCode
            });
        
        // إذا كان هناك كود إحالة
        if (referralCode && referralCode.trim() !== '') {
            const referrer = await User.findOne({ referralCode: referralCode.trim() });
            if (referrer) {
                user.referredBy = referrer.username;
                // إضافة نقاط للمُحيل (500 نقطة حقيقية)
                referrer.actualPoints += 500;
                referrer.referralBonus += 500;
                referrer.totalReferrals += 1;
                await referrer.save();
                
                // إضافة 100 نقطة للمستخدم الجديد (حقيقية)
                user.actualPoints = 100;
            }
        }
        
        await user.save();
        
        // إنشاء توكن
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        
        res.status(201).json({
            success: true,
            message: "تم إنشاء الحساب بنجاح",
            token,
                username: user.username,
                referralCode: user.referralCode
            });
        
            } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
            }
            });

// 2. تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // التحقق من البيانات
        if (!username || !password) {
            return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
        }
        
        // التحقق إذا كان المدير هو من يدخل
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            const token = jwt.sign(
                { username, isAdmin: true },
                JWT_SECRET,
                    { expiresIn: '30d' }
            );
            return res.json({
                        success: true,
                token,
                        isAdmin: true,
                username,
                        points: 0,
                        referralCode: "ADMIN"
                });
                }
        
        // البحث عن المستخدم
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        }
        
        // التحقق من كلمة المرور
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        }
        
        // تحديث وقت النشاط الأخير
        user.lastActive = new Date();
        await user.save();
        
        // إنشاء توكن
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        
        // حساب النقاط المعروضة (25% من النقاط الحقيقية)
        const displayPoints = Math.floor(user.actualPoints * 0.25);
        
        res.json({
            success: true,
            token,
                username: user.username,
                points: displayPoints, // نقاط معروضة
                actualPoints: user.actualPoints, // نقاط حقيقية (للاستخدام الداخلي)
                referralCode: user.referralCode,
                isSharing: user.isSharing,
                level: user.level,
                sharedData: user.sharedData,
                connectionTime: user.connectionTime,
                totalReferrals: user.totalReferrals,
                referralBonus: Math.floor(user.referralBonus * 0.25) // مكافأة إحالة معروضة
            });
        
            } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
            }
            });

// 3. جلب بيانات المستخدم
app.get('/api/user/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح" });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        // حساب النقاط المعروضة (25% من النقاط الحقيقية)
        const displayPoints = Math.floor(user.actualPoints * 0.25);
        const displayReferralBonus = Math.floor(user.referralBonus * 0.25);
        
        res.json({
            success: true,
            points: displayPoints,
            actualPoints: user.actualPoints,
            isSharing: user.isSharing,
            username: user.username,
            level: user.level,
            sharedData: user.sharedData,
            connectionTime: user.connectionTime,
            referralCode: user.referralCode,
            totalReferrals: user.totalReferrals,
            referralBonus: displayReferralBonus,
            walletBalance: (displayPoints * 0.01).toFixed(2), // 100 نقطة = 1 دولار
            totalEarnings: ((user.actualPoints + user.referralBonus) * 0.01 * 0.25).toFixed(2)
        });
        
    } catch (error) {
        console.error('Status error:', error);
        res.status(401).json({ error: "توكن غير صالح" });
    }
});

// 4. تحديث بيانات المشاركة
app.post('/api/user/update-sharing', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح" });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { isSharing, sharedData, connectionTime } = req.body;
        
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        // تحديث حالة المشاركة
        user.isSharing = isSharing || user.isSharing;
        
        // إذا كان يشارك، أضف البيانات والوقت
        if (isSharing && sharedData) {
            user.sharedData += sharedData;
            user.connectionTime += connectionTime || 1;
            
            // حساب النقاط المكتسبة (10 نقاط لكل 1 جيجابايت - حقيقي)
            const pointsEarned = Math.floor(sharedData * 10);
            user.actualPoints += pointsEarned;
            
            // تحديث المستوى بناءً على البيانات المشتركة
            if (user.sharedData > 1000) user.level = 5;
            else if (user.sharedData > 500) user.level = 4;
            else if (user.sharedData > 200) user.level = 3;
            else if (user.sharedData > 50) user.level = 2;
        }
        
        await user.save();
        
        // إرجاع النقاط المعروضة (25%)
        const displayPoints = Math.floor(user.actualPoints * 0.25);
        
        res.json({
            success: true,
            points: displayPoints,
            actualPoints: user.actualPoints,
            isSharing: user.isSharing,
            sharedData: user.sharedData,
            connectionTime: user.connectionTime,
            level: user.level
        });
        
    } catch (error) {
        console.error('Update sharing error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
    }
});

// 5. طلب سحب الأموال
app.post('/api/withdrawal/request', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح" });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { points, method } = req.body;
        
        if (!points || !method) {
            return res.status(400).json({ error: "النقاط وطريقة السحب مطلوبان" });
        }
        
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        // حساب النقاط المعروضة (25%)
        const displayPoints = Math.floor(user.actualPoints * 0.25);
        
        // التحقق من أن النقاط المطلوبة أقل من أو تساوي النقاط المعروضة
        if (points > displayPoints) {
            return res.status(400).json({ error: "نقاط غير كافية" });
        }
        
        // الحد الأدنى للسحب: 1000 نقطة معروضة
        if (points < 1000) {
            return res.status(400).json({ error: "الحد الأدنى للسحب هو 1000 نقطة" });
        }
        
        // حساب النقاط الحقيقية المطلوبة (نقاط معروضة ÷ 0.25)
        const actualPointsNeeded = Math.floor(points / 0.25);
        
        // التحقق من النقاط الحقيقية
        if (actualPointsNeeded > user.actualPoints) {
            return res.status(400).json({ error: "نقاط غير كافية" });
        }
        
        // حساب المبلغ الحقيقي (100 نقطة = 1 دولار)
        const actualAmount = (actualPointsNeeded * 0.01).toFixed(2);
        const displayAmount = (points * 0.01).toFixed(2); // المبلغ المعروض
        
        // خصم النقاط الحقيقية
        user.actualPoints -= actualPointsNeeded;
        
        // إنشاء طلب سحب
        const withdrawal = new Withdrawal({
            userId: user._id,
            username: user.username,
            points: points, // النقاط المعروضة
            amount: parseFloat(actualAmount), // المبلغ الحقيقي
            displayAmount: parseFloat(displayAmount), // المبلغ المعروض
            method: method,
            transactionId: 'WD' + Date.now() + Math.random().toString(36).substring(2, 9).toUpperCase(),
            status: 'pending'
        });
        
        await withdrawal.save();
        await user.save();
        
        res.json({
            success: true,
            message: "تم إرسال طلب السحب بنجاح",
            requestId: withdrawal.transactionId,
            points: points,
            amount: displayAmount, // إرجاع المبلغ المعروض فقط
            method: method,
            status: 'pending'
        });
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
    }
});

// 6. سجل عمليات السحب
app.get('/api/withdrawal/history', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح" });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const withdrawals = await Withdrawal.find({ userId: decoded.userId })
            .sort({ createdAt: -1 })
            .limit(20);
        
        // إرجاع المبالغ المعروضة فقط
        const displayWithdrawals = withdrawals.map(w => ({
            id: w.transactionId,
            points: w.points,
            value: w.displayAmount.toFixed(2), // المبلغ المعروض
            method: w.method,
            status: w.status,
            date: w.createdAt.toLocaleDateString()
        }));
        
        res.json({
            success: true,
            withdrawals: displayWithdrawals
        });
        
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
    }
});

// 7. تحديث النقاط يدوياً
app.post('/api/user/update-points', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح" });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // التحقق إذا كان مدير
        if (!decoded.isAdmin) {
            return res.status(403).json({ error: "غير مصرح" });
        }
        
        const { username, points } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        // إضافة النقاط الحقيقية
        user.actualPoints += points;
        await user.save();
        
        // حساب النقاط المعروضة
        const displayPoints = Math.floor(user.actualPoints * 0.25);
        
        res.json({
            success: true,
            message: "تم تحديث النقاط",
            actualPoints: user.actualPoints,
            displayPoints: displayPoints
        });
        
        } catch (error) {
        console.error('Update points error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
        }
        });

// 8. صفحة الإحصائيات للمدير
app.get('/api/admin/stats', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح" });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // التحقق إذا كان مدير
        if (!decoded.isAdmin) {
            return res.status(403).json({ error: "غير مصرح" });
        }
        
        const totalUsers = await User.countDocuments();
        const totalActualPoints = await User.aggregate([
        { $group: { _id: null, total: { $sum: "$actualPoints" } } }
        ]);
        
        const totalDisplayPoints = Math.floor((totalActualPoints[0]?.total || 0) * 0.25);
        const totalWithdrawals = await Withdrawal.countDocuments();
        
        res.json({
            success: true,
            totalUsers,
                totalActualPoints: totalActualPoints[0]?.total || 0,
            totalDisplayPoints,
            totalWithdrawals
            });
        
            } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: "خطأ في السيرفر" });
            }
            });

// 9. مسار الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    console.log('New user connected:', socket.id);
    
    socket.on('startSharing', async (data) => {
        try {
            const { token, bandwidth } = data;
            const decoded = jwt.verify(token, JWT_SECRET);
            
            const user = await User.findById(decoded.userId);
            if (user) {
                user.isSharing = true;
                await user.save();
                
                console.log(`User ${user.username} started sharing with ${bandwidth}GB limit`);
                
                // إرسال تحديثات النقاط كل دقيقة
                setInterval(async () => {
                    if (user.isSharing) {
                        // محاكاة مشاركة البيانات (0.1 جيجابايت كل دقيقة)
                        const dataShared = 0.1;
                        user.sharedData += dataShared;
                        user.connectionTime += 1;
                        
                        // إضافة النقاط الحقيقية
                        const pointsEarned = Math.floor(dataShared * 10);
                        user.actualPoints += pointsEarned;
                        
                        await user.save();
                        
                        // إرسال النقاط المعروضة للعميل
                        const displayPoints = Math.floor(user.actualPoints * 0.25);
                        socket.emit('pointsUpdate', {
                            points: displayPoints,
                            actualPoints: user.actualPoints,
                            sharedData: user.sharedData,
                            connectionTime: user.connectionTime
                        });
                    }
                }, 10000); // كل 10 ثواني
            }
        } catch (error) {
            console.error('Socket sharing error:', error);
        }
    });
    
    socket.on('stopSharing', async (data) => {
        try {
            const { token } = data;
            const decoded = jwt.verify(token, JWT_SECRET);
            
            const user = await User.findById(decoded.userId);
            if (user) {
                user.isSharing = false;
                await user.save();
                console.log(`User ${user.username} stopped sharing`);
            }
        } catch (error) {
            console.error('Socket stop sharing error:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
