// server.js - Ghost Secure Edition (Clean Version)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);

// --- 🛡️ حماية السيرفر ---
app.use(helmet()); // درع حماية ضد الثغرات المعروفة
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());
app.use(express.static('public'));

// --- 🗝️ سحب البيانات من Render (التي أضفتها أنت يا آدم) ---
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;

// الاتصال بقاعدة البيانات
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected Securely to MongoDB Atlas'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// تعريف Schema المستخدم
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    actualPoints: { type: Number, default: 0 },
    sharedData: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// إعداد الـ WebSocket
const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET", "POST"] }
});

// --- 🔒 نظام الحماية ومنع التلاعب بالأرباح ---
io.on('connection', (socket) => {
    socket.on('updateUsage', async (data) => {
        try {
            const { token, actualUsage } = data;
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.userId);

            if (user) {
                // 🛑 قفل الحماية: إذا حاول أحد إرسال أكثر من 1 ميجا في الطلب الواحد
                // سيتم رفض الطلب فوراً (حماية من الـ Bots والتلاعب)
                if (actualUsage > 1.0) {
                    console.warn(`🚨 محاولة تلاعب مكتشفة من: ${user.username}`);
                    return; 
                }

                user.sharedData += actualUsage;
                user.actualPoints += (actualUsage * 100); // 100 نقطة لكل ميجا
                await user.save();

                socket.emit('pointsUpdate', {
                    points: Math.floor(user.actualPoints * 0.25), // العرض للمستخدم
                    sharedData: user.sharedData.toFixed(2)
                });
            }
        } catch (err) {
            console.error("Auth Error in Socket");
        }
    });
});

// تشغيل السيرفر
server.listen(PORT, () => {
    console.log(`🚀 Ghost App Securely Running on Port ${PORT}`);
});
