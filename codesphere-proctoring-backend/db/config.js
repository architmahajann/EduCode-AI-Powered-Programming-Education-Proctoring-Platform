// const mongoose = require("mongoose");

// exports.connect = () => {
//     mongoose
//         .connect(process.env.MONGO_URI, {
//             useNewUrlParser: true,
//             useUnifiedTopology: true,
//         })
//         .then(() => {
//             console.log("Connected to MongoDB");
//         })
//         .catch((err) => {
//             console.log(err);
//         });
// };

const mongoose = require("mongoose");

const connectDB = async (url) => {
    if (!url) {
        throw new Error('MongoDB connection URL is required');
    }
    try {
        await mongoose.connect(url, {
            // Note: useNewUrlParser and useUnifiedTopology are no longer needed in Mongoose 6+
        });
        console.log('Connected to MongoDB successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
};

module.exports = connectDB;
