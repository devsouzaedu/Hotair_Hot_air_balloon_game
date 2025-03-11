const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    googleId: String,
    email: String,
    name: String,
    picture: String,
    totalScore: { type: Number, default: 0 },
    targetsHit: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Player', PlayerSchema);
