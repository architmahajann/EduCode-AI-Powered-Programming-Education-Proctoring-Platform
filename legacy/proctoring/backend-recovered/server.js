const express = require("express");
const app = express();

const bodyParser = require("body-parser");
const cors = require("cors");
const uniqueId = require("uniqid");
require("dotenv").config();
const connectDB = require("./db/config.js");
const UserDataSchema = require("./models/userdata.js");
const port = process.env.PORT || 3000;
const cloudinary = require('cloudinary');


var interval = 5000;

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());
app.use(express.static("./public"));

/*  route to set new value to interval  */
app.get("/set_interval", (req, res) => {
    interval = req.query.interval * 60 * 1000;
    console.log("interval setted to " + interval + " miliseconds");
    res.send({ success: true }).status(200).end();
});

/*  route for createting new User */
app.post("/createUser", async (req, res) => {
    try {
        const id = uniqueId.time();

        const { firstName, lastName, email, testInvitation } = req.body;
        console.log(req.body);

        const UserDataSchemaObj = {
            firstName: firstName,
            lastName: lastName,
            email: email,
            testInvitation: testInvitation,
            id: id,
            images: [],
        };

        const data = new UserDataSchema(UserDataSchemaObj);
        await data.save(); // async

        res.send({ userid: id }).status(200).end();
    } catch {
        // if error is occured
        res.send({ error: "Something went wrong" }).status(500).end();
    }
});

// Configure Cloudinary if credentials are provided
if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
) {
    cloudinary.v2.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

/*  route to upload image from extension */
app.post("/upload-image", async (req, res) => {
    try {
        const { userid, image } = req.body;
        if (!userid || !image) {
            return res.status(400).send("'userid' and 'image' are required");
        }

        const fileName = uniqueId.time();
        let imageUrl = null;

        // Upload to Cloudinary when configured
        if (
            process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        ) {
            const result = await cloudinary.v2.uploader.upload(image, {
                folder: "Educode-proctoring",
                public_id: fileName,
            });
            imageUrl = result.secure_url;
        } else {
            console.warn("Cloudinary is not configured. Skipping upload.");
            imageUrl = "not-uploaded";
        }

        // Update user document with the new image URL
        await UserDataSchema.findOneAndUpdate(
            { id: userid },
            { $push: { images: { id: fileName, url: imageUrl } } },
            { new: true }
        );

        // Return success response along with current capture interval
        res.status(200).json({ interval });
    } catch (error) {
        console.log("Error uploading image:", error);
        res.status(500).send("Failed to save image");
    }
});


/*  route to get all users data */
app.get("/retrieve-data", async (_req, res) => {
    const data = await UserDataSchema.find({});

    res.json({ data: data }).status(200).end();
});

app.get("/cleardb", async (_req, res) => {
    const data = await UserDataSchema.deleteMany();
    res.json({ message: data }).status(200).end();
});


const start = async () => {
    try {
        // Support both MONGO_URI and MONGO_DB_URI
        const mongoUrl = process.env.MONGO_URI || process.env.MONGO_DB_URI;
        await connectDB(mongoUrl);
        app.listen(port, () =>
            console.log(`API is setup on✅... http://localhost:${port}/`)
        );
        console.log("connected to db🔥...");
    } catch (err) {
        console.log("error with db❌ =>", err);
    }
};

start();
