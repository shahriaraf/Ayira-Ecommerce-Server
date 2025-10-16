const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const multer = require("multer");
const path = require("path");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");
const Pdfmake = require("pdfmake");
const fs = require("fs");
const fetch = require("node-fetch");
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);

app.use(express.json());

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5000",
    "https://ayira-ecommerce-main.vercel.app",
    "https://y-lac-seven.vercel.app",
    "https://aaryansourcing.com",
  ],
};
app.use(cors(corsOptions));
const io = new Server(server, {
  cors: corsOptions,
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

const printer = new Pdfmake(fonts);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const orderImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/orders");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "order-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const uploadOrderImage = multer({ storage: orderImageStorage });

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.56yvv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let sizeChartsCollection;
let bannersCollection;
let ordersCollection;
let usersCollection;
let addressCollection;
let blogsCollection;
let commentsCollection;
let productAttributeCollection;
let productReviewCollection;
let productsCollection;
let categoriesCollection;
let wishListsCollection;
let conversationsCollection;
let newsLetterCollection;

async function run() {
  try {
    await client.connect();
    const Db = client.db("Ayira-Database");

    sizeChartsCollection = Db.collection("sizeCharts");
    bannersCollection = Db.collection("banners");
    ordersCollection = Db.collection("orders");
    usersCollection = Db.collection("All-Users");
    addressCollection = Db.collection("address");
    blogsCollection = Db.collection("blogs");
    commentsCollection = Db.collection("comments");
    productAttributeCollection = Db.collection("Product-Attributes");
    productReviewCollection = Db.collection("Product-Reviews");
    productsCollection = Db.collection("all-products");
    categoriesCollection = Db.collection("categories");
    wishListsCollection = Db.collection("wishlists");
    conversationsCollection = Db.collection("conversations");
    newsLetterCollection = Db.collection("newsLetters");
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
  } catch (err) {
    console.error("DB connection failed:", err);
  }
}
run().catch(console.dir);

// Root
app.get("/", (req, res) => {
  res.send("ayira server is running");
});

app.get("/api/conversations", async (req, res) => {
  try {
    const conversations = await conversationsCollection
      .aggregate([
        { $unwind: "$participants" },
        { $match: { "participants.role": "user" } },
        {
          $lookup: {
            from: "All-Users",
            localField: "participants.userId",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $project: {
            _id: 1,
            lastMessage: {
              $ifNull: [{ $last: "$messages.content" }, "No messages yet..."],
            },
            lastMessageTimestamp: { $last: "$messages.timestamp" },
            customerName: { $arrayElemAt: ["$userDetails.name", 0] },
            userId: "$participants.userId",
          },
        },
        { $sort: { lastMessageTimestamp: -1 } },
      ])
      .toArray();
    res.send(conversations);
  } catch (err) {
    console.error("Error fetching conversations:", err);
    res.status(500).send({ error: "Failed to fetch conversations." });
  }
});

app.get("/api/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!ObjectId.isValid(userId)) {
      return res.status(400).send({ error: "Invalid user ID format." });
    }
    const conversation = await conversationsCollection.findOne({
      "participants.userId": new ObjectId(userId),
    });
    res.send(conversation ? conversation.messages : []);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).send({ error: "Failed to fetch messages." });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const { captchaToken, ...newOrder } = req.body;

    if (!captchaToken) {
      return res.status(400).json({ message: "CAPTCHA token is missing." });
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaToken}`;

    const verificationResponse = await fetch(verificationUrl, {
      method: "POST",
    });
    const verificationData = await verificationResponse.json();

    if (!verificationData.success) {
      return res
        .status(400)
        .json({ message: "CAPTCHA verification failed. Please try again." });
    }

    const result = await ordersCollection.insertOne(newOrder);
    res.status(201).send(result);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).send({ error: err.message });
  }
});

app.post(
  "/upload-order-image",
  uploadOrderImage.single("image"),
  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded." });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/orders/${
      req.file.filename
    }`;
    res.json({ success: true, imageUrl: imageUrl });
  }
);

app.get("/orders", async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const result = await ordersCollection
      .find(query)
      .sort({ _id: -1 })
      .toArray();

    res.send(result);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).send({ error: "Failed to fetch orders." });
  }
});
app.get("/order", async (req, res) => {
  try {
    const { search, email, page = 1, limit = 3 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    let query = {};
    if (email) {
      query.email = email;
    } else if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const [orders, totalOrders] = await Promise.all([
      ordersCollection
        .find(query)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      ordersCollection.countDocuments(query),
    ]);
    res.send({
      orders,
      totalOrders,
      totalPages: Math.ceil(totalOrders / limitNum),
      currentPage: pageNum,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).send({ error: "Failed to fetch orders." });
  }
});
app.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .send({ success: false, error: "Invalid order ID format." });
    }
    const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .send({ success: false, error: "Order not found." });
    }
    res.send({ success: true, message: "Order deleted successfully." });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).send({ success: false, error: "Failed to delete order." });
  }
});

const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/banners");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const bannerUpload = multer({ storage: bannerStorage });

const sizeChartStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/size_charts");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const uploadSizeChart = multer({ storage: sizeChartStorage });

const blogStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/blogs");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const uploadBlog = multer({ storage: blogStorage });

app.post(
  "/blogs",
  uploadBlog.fields([
    { name: "image", maxCount: 1 },
    { name: "metaImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        category,
        content,
        shortDescription,
        note,
        tags,
        metaTitle,
        metaDescription,
        mainImageAltText,
        metaKeywords,
        metaRobots,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription,
      } = req.body;

      const blogImage = req.files["image"]
        ? `/uploads/blogs/${req.files["image"][0].filename}`
        : null;
      const metaImage = req.files["metaImage"]
        ? `/uploads/blogs/${req.files["metaImage"][0].filename}`
        : null;

      const blogData = {
        title,
        category,
        content,
        shortDescription,
        note,
        tags,
        image: blogImage,
        metaTitle,
        metaDescription,
        mainImageAltText,
        metaKeywords,
        metaRobots,
        metaImage,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription,
        createdAt: new Date(),
      };

      const result = await blogsCollection.insertOne(blogData);
      const newBlog = await blogsCollection.findOne({ _id: result.insertedId });
      res
        .status(201)
        .send({ message: "Blog created successfully", blog: newBlog });
    } catch (err) {
      console.error("Error creating blog:", err);
      res.status(500).send({ success: false, error: err.message });
    }
  }
);

app.post("/blogs/upload-image", uploadBlog.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ error: "No image file provided." });
  }
  try {
    const imageUrl = `/uploads/blogs/${req.file.filename}`;
    res.status(200).send({
      success: true,
      imageUrl: imageUrl,
    });
  } catch (error) {
    console.error("Error during blog image upload:", error);
    res.status(500).send({ error: "Server error during image upload." });
  }
});

app.get("/blogs", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, category } = req.query;
    let query = {};
    if (category && category !== "all") {
      query.category = category;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }
    const [blogs, totalBlogs] = await Promise.all([
      blogsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      blogsCollection.countDocuments(query),
    ]);
    const totalPages = Math.ceil(totalBlogs / limit);
    res.send({
      blogs,
      totalBlogs,
      totalPages,
      currentPage: page,
    });
  } catch (err) {
    console.error("Error fetching blogs:", err);
    res.status(500).send({ error: "Failed to fetch blogs." });
  }
});
app.get("/blogs/search-titles", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") {
      return res.send([]);
    }
    const query = { title: { $regex: q, $options: "i" } };
    const projection = { _id: 1, title: 1 };
    const blogs = await blogsCollection
      .find(query)
      .project(projection)
      .limit(10)
      .toArray();
    res.send(blogs);
  } catch (err) {
    console.error("Error searching blog titles:", err);
    res.status(500).send({ error: "Failed to search blogs." });
  }
});

app.get("/blogs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid blog ID format." });
    }
    const query = { _id: new ObjectId(id) };
    const blog = await blogsCollection.findOne(query);
    if (!blog) {
      return res.status(404).send({ error: "Blog not found." });
    }
    res.send(blog);
  } catch (err) {
    console.error("Error fetching single blog:", err);
    res.status(500).send({ error: err.message });
  }
});
app.put(
  "/blogs/:id",
  uploadBlog.fields([
    { name: "image", maxCount: 1 },
    { name: "metaImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, error: "Invalid blog ID." });
      }
      const {
        title,
        category,
        content,
        shortDescription,
        note,
        tags,
        existingImage,
        metaTitle,
        metaDescription,
        mainImageAltText,
        metaKeywords,
        metaRobots,
        existingMetaImage,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription,
      } = req.body;

      const blogImage = req.files["image"]
        ? `/uploads/blogs/${req.files["image"][0].filename}`
        : existingImage || null;
      const metaImage = req.files["metaImage"]
        ? `/uploads/blogs/${req.files["metaImage"][0].filename}`
        : existingMetaImage || null;

      const updatedBlogData = {
        title,
        category,
        content,
        shortDescription,
        note,
        tags,
        image: blogImage,
        metaTitle,
        metaDescription,
        mainImageAltText,
        metaKeywords,
        metaRobots,
        metaImage,
        ogTitle,
        ogDescription,
        twitterTitle,
        twitterDescription,
        updatedAt: new Date(),
      };

      const result = await blogsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedBlogData }
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, error: "Blog not found." });
      }

      const updatedBlog = await blogsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send({
        success: true,
        message: "Blog updated successfully",
        blog: updatedBlog,
      });
    } catch (err) {
      console.error("Error updating blog:", err);
      res.status(500).send({ success: false, error: err.message });
    }
  }
);

app.delete("/blogs/:id", async (req, res) => {
  try {
    const blogId = req.params.id;
    if (!ObjectId.isValid(blogId)) {
      return res
        .status(400)
        .send({ success: false, error: "Invalid blog ID." });
    }
    await blogsCollection.deleteOne({ _id: new ObjectId(blogId) });
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting blog:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/categories", async (req, res) => {
  try {
    const { value } = req.body;
    if (!value)
      return res.status(400).send({ error: "Category value is required" });
    const result = await categoriesCollection.insertOne({ value });
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/categories", async (req, res) => {
  try {
    const categories = await categoriesCollection.find().toArray();
    res.send(categories);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.post("/api/post-users", async (req, res) => {
  try {
    const user = req.body;
    const query = { email: user.email };
    const userAlreadyExist = await usersCollection.findOne(query);
    if (userAlreadyExist) {
      return res.send({
        message: "You are already registered. Please log in.",
        insertedId: null,
      });
    }

    const userWithDefaults = {
      ...user,
      role: user.role || "user",
      permissions: user.permissions || [],
    };

    const result = await usersCollection.insertOne(userWithDefaults);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.delete("/categories/:id", async (req, res) => {
  const { id } = req.params;
  const result = await categoriesCollection.deleteOne({
    _id: new ObjectId(id),
  });
  res.send(result);
});
app.get("/api/user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    console.log(email);

    const query = { email: email };
    console.log(query);
    const user = await usersCollection.findOne(query);
    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }
    res.send(user);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.patch("/api/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role, permissions } = req.body;
    if (!role) {
      return res.status(400).send({ error: "Role is required." });
    }
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        role: role,
        permissions: permissions || [],
      },
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).send({ error: "User not found." });
    }
    res.send({
      success: true,
      message: "User role updated successfully.",
      result,
    });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).send({ error: err.message });
  }
});
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id) };
    const result = await usersCollection.deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "User not found." });
    }
    res.send({ success: true, message: "User deleted successfully." });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send({ error: err.message });
  }
});
app.get("/api/find-all-users", async (req, res) => {
  try {
    const count = await usersCollection.countDocuments();
    res.send({ length: count });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.get("/api/staff", async (req, res) => {
  try {
    const queryFilter = { role: "staff" };
    const staff = await usersCollection.find(queryFilter).toArray();
    res.send(staff);
  } catch (err) {
    console.error("Error fetching staff:", err);
    res.status(500).send({ error: err.message });
  }
});
app.get("/api/promotable-users", async (req, res) => {
  try {
    const query = { role: "user" };

    const options = {
      projection: { _id: 1, name: 1, email: 1 },
      sort: { name: 1 },
    };
    const users = await usersCollection.find(query, options).toArray();
    res.send(users);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.get("/api/stats", async (req, res) => {
  try {
    const [totalUsers, totalProducts, totalOrders] = await Promise.all([
      usersCollection.countDocuments({}),
      productsCollection.countDocuments({}),
      ordersCollection.countDocuments({}),
    ]);
    res.send({
      totalUsers,
      totalProducts,
      totalOrders,
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).send({ error: err.message });
  }
});
app.post("/comments", async (req, res) => {
  try {
    const comment = req.body;
    const result = await commentsCollection.insertOne(comment);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.get("/comments", async (req, res) => {
  try {
    const { blogId } = req.query;
    let query = {};
    if (blogId) {
      query = { blogId: blogId };
    }

    const result = await commentsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).send({ error: err.message });
  }
});
app.get("/api/users", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const queryFilter = {
      role: "user",
      ...(search && { name: { $regex: search, $options: "i" } }),
    };

    const [users, totalUsers] = await Promise.all([
      usersCollection.find(queryFilter).skip(skip).limit(limit).toArray(),
      usersCollection.countDocuments(queryFilter),
    ]);

    res.send({
      users,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send({ error: err.message });
  }
});
app.get("/api/staff", async (req, res) => {
  try {
    const queryFilter = { role: "staff" };
    const staff = await usersCollection.find(queryFilter).toArray();
    res.send(staff);
  } catch (err) {
    console.error("Error fetching staff:", err);
    res.status(500).send({ error: err.message });
  }
});

app.get("/api/promotable-users", async (req, res) => {
  try {
    const query = { role: "user" };
    const options = {
      projection: { _id: 1, name: 1, email: 1 },
      sort: { name: 1 },
    };
    const users = await usersCollection.find(query, options).toArray();
    res.send(users);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const [totalUsers, totalProducts, totalOrders] = await Promise.all([
      usersCollection.countDocuments({}),
      productsCollection.countDocuments({}),
      ordersCollection.countDocuments({}),
    ]);
    res.send({
      totalUsers,
      totalProducts,
      totalOrders,
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).send({ error: err.message });
  }
});
app.post("/address", async (req, res) => {
  try {
    const address = req.body;
    const result = await addressCollection.insertOne(address);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.get("/address", async (req, res) => {
  try {
    const addresses = await addressCollection.find().toArray();
    res.send(addresses);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/products");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });
app.post(
  "/post-products",

  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "metaImage", maxCount: 1 },
    { name: "sizeChartImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 50 },
    { name: "brandLogo", maxCount: 50 },
    { name: "mainPdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        productCode,
        GSM_Code,
        productCategory,
        productSubCategory,
        productStatus,
        productSize,
        colors,
        fit,
        Sustainability,
        brand,
        price,
        disCountPrice,
        email,
        availabelVarients,
        description,
        printingEmbroidery,
        textileCare,
        shortDescription,
        genderSizing,
        metaTitle,
        metaDescription,
        metaKeywords,
        mainImageAltText,
        metaRobots,
        openGraphTitle,
        openGraphDescription,
        twitterTitle,
        twitterDescription,
        facebookUrl,
        twitterUrl,
        instagramUrl,
        linkedInUrl,
      } = req.body;

      const productColors = colors ? JSON.parse(colors) : [];
      const parsedVariants = availabelVarients
        ? JSON.parse(availabelVarients)
        : [];
      const parsedDescription = description ? JSON.parse(description) : null;
      const parsedPrintingEmbroidery = printingEmbroidery
        ? JSON.parse(printingEmbroidery)
        : null;
      const parsedTextileCare = textileCare ? JSON.parse(textileCare) : null;

      const parsedGenderSizing = genderSizing ? JSON.parse(genderSizing) : [];

      const mainImage = req.files["mainImage"]
        ? `/uploads/products/${req.files["mainImage"][0].filename}`
        : null;
      const metaImage = req.files["metaImage"]
        ? `/uploads/products/${req.files["metaImage"][0].filename}`
        : null;

      const sizeChartImage = req.files["sizeChartImage"]
        ? `/uploads/products/${req.files["sizeChartImage"][0].filename}`
        : null;
      const galleryImages = req.files["galleryImages"]
        ? req.files["galleryImages"].map(
            (file) => `/uploads/products/${file.filename}`
          )
        : [];
      const brandLogo = req.files["brandLogo"]
        ? req.files["brandLogo"].map(
            (file) => `/uploads/products/${file.filename}`
          )
        : [];
      const mainPdf = req.files["mainPdf"]
        ? `/uploads/products/${req.files["mainPdf"][0].filename}`
        : null;
      const productData = {
        email,
        title,
        productCode,
        GSM_Code,
        productCategory,
        productSubCategory,
        productStatus,
        productSize,
        fit,
        brand,
        price: Number(price),
        disCountPrice: disCountPrice ? Number(disCountPrice) : null,
        Sustainability,
        shortDescription,
        metaTitle,
        metaDescription,
        metaKeywords,
        mainImageAltText,
        metaRobots,
        openGraphTitle,
        openGraphDescription,
        twitterTitle,
        twitterDescription,
        socialMedia: {
          facebook: facebookUrl,
          twitter: twitterUrl,
          instagram: instagramUrl,
          linkedIn: linkedInUrl,
        },
        mainImage,
        metaImage,
        sizeChartImage,
        galleryImages,
        brandLogo,
        mainPdf,
        createdAt: new Date(),
        colors: productColors,
        genderSizing: parsedGenderSizing,
        availabelVarients: parsedVariants,
        description: parsedDescription,
        printingEmbroidery: parsedPrintingEmbroidery,
        textileCare: parsedTextileCare,
      };
      const result = await productsCollection.insertOne(productData);
      res.send({
        success: true,
        message: "Product created successfully",
        insertedId: result.insertedId,
      });
    } catch (err) {
      console.error("Error saving product:", err);
      res.status(500).send({ success: false, error: err.message });
    }
  }
);
app.get("/find-filterd-products", async (req, res) => {
  try {
    const {
      category,
      subCategory,
      size,
      gender,
      colour,
      fit,
      sustainability,
      search,
      brand,
      page = 1,
      limit = 12,
    } = req.query;
    let query = {};
    if (category) query.productCategory = { $regex: new RegExp(category, "i") };
    if (subCategory)
      query.productSubCategory = { $regex: new RegExp(subCategory, "i") };
    if (colour) query.productColour = colour;
    if (fit) query.fit = fit;
    if (sustainability) query.Sustainability = sustainability;
    if (brand) query.brand = brand;
    if (search) query.title = { $regex: new RegExp(search, "i") };
    if (size && gender) {
      query.genderSizing = {
        $elemMatch: {
          gender: { $regex: new RegExp(gender, "i") },
          sizes: size,
        },
      };
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalProducts = await productsCollection.countDocuments(query);
    const result = await productsCollection
      .find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    res.send({
      data: result,
      total: totalProducts,
      page: parseInt(page),
      pages: Math.ceil(totalProducts / limit),
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.delete("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    const result = await productsCollection.deleteOne(query);

    if (result.deletedCount > 0) {
      res
        .status(200)
        .send({ success: true, message: "Product deleted successfully" });
    } else {
      res.status(404).send({ success: false, message: "Product not found" });
    }
  } catch (error) {
    console.error("Delete error:", error);
    res
      .status(500)
      .send({ success: false, message: "Failed to delete product" });
  }
});

app.patch("/update-product/:id", upload.fields([]), async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid product ID format." });
    }
    const { body, files } = req;
    const updateFields = {};
    const simpleFields = [
      "title",
      "productCode",
      "GSM_Code",
      "productCategory",
      "productSubCategory",
      "productStatus",
      "productSize",
      "fit",
      "brand",
      "Sustainability",
      "shortDescription",
      "metaTitle",
      "metaDescription",
      "mainImageAltText",
      "metaKeywords",
      "metaRobots",
      "openGraphTitle",
      "openGraphDescription",
      "twitterTitle",
      "twitterDescription",
    ];

    simpleFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateFields[field] = body[field];
      }
    });

    if (body.email) {
      updateFields.email = body.email;
    }

    if (body.price !== undefined) {
      updateFields.price = Number(body.price);
    }
    if (body.disCountPrice !== undefined) {
      updateFields.disCountPrice = Number(body.disCountPrice);
    }

    const safeJsonParse = (value) => {
      if (!value) return null;
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (e) {
          console.error("Failed to parse JSON for value:", value, e);
          return null;
        }
      }
      return value;
    };
    const jsonFields = {
      colors: body.colors,
      availabelVarients: body.availabelVarients,
      description: body.richDescription,
      printingEmbroidery: body.printingEmbroidery,
      textileCare: body.textileCare,
      genderSizing: body.genderSizing,
    };

    for (const key in jsonFields) {
      if (jsonFields[key]) {
        const parsedValue = safeJsonParse(jsonFields[key]);
        if (parsedValue !== null) {
          updateFields[key] = parsedValue;
        }
      }
    }

    // Process file uploads (This part remains the same)
    if (files.mainImage) {
      updateFields.mainImage = `/uploads/products/${files.mainImage[0].filename}`;
    }
    // ... other file uploads

    if (files.galleryImages && files.galleryImages.length > 0) {
      updateFields.galleryImages = files.galleryImages.map(
        (file) => `/uploads/products/${file.filename}`
      );
    }
    if (files.brandLogo && files.brandLogo.length > 0) {
      updateFields.brandLogo = files.brandLogo.map(
        (file) => `/uploads/products/${file.filename}`
      );
    }
    if (files.mainPdf) {
      updateFields.mainPdf = `/uploads/products/${files.mainPdf[0].filename}`;
    }
    if (files.sizeChartImage) {
      updateFields.sizeChartImage = `/uploads/products/${files.sizeChartImage[0].filename}`;
    }
    if (files.metaImage) {
      updateFields.metaImage = `/uploads/products/${files.metaImage[0].filename}`;
    }
    if (
      body.facebookUrl ||
      body.twitterUrl ||
      body.instagramUrl ||
      body.linkedInUrl
    ) {
      updateFields.socialMedia = {
        facebook: body.facebookUrl || "",
        twitter: body.twitterUrl || "",
        instagram: body.instagramUrl || "",
        linkedIn: body.linkedInUrl || "",
      };
    }
    updateFields.updatedAt = new Date();
    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: updateFields,
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .send({ success: false, message: "Product not found." });
    }

    res.send({
      success: true,
      message: "Product updated successfully!",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error while updating product:", err);
    res.status(500).send({
      success: false,
      message: err.message || "An internal server error occurred.",
    });
  }
});
app.post("/post-productAttribute", async (req, res) => {
  try {
    let { key, value } = req.body;
    if (!key || !value) {
      return res.status(400).send({ error: "Key and value are required" });
    }

    let valueToSave = value;
    let query = {};

    if (typeof value === "object" && value !== null && value.colourName) {
      const colourNameToCheck = value.colourName.trim().toLowerCase();

      query = {
        [`productAttributes.${key}.value.colourName`]: {
          $regex: new RegExp(`^${colourNameToCheck}$`, "i"),
        },
      };

      valueToSave = {
        colourName: value.colourName.trim(),
        colourCode: value.colourCode,
      };
    } else if (typeof value === "string") {
      const stringValueToCheck = value.trim().toLowerCase();

      query = {
        [`productAttributes.${key}.value`]: {
          $regex: new RegExp(`^${stringValueToCheck}$`, "i"),
        },
      };

      valueToSave = stringValueToCheck;
    } else {
      return res.status(400).send({ error: "Invalid value format" });
    }

    const exists = await productAttributeCollection.findOne(query);

    if (exists) {
      return res.status(400).send({ error: "This value already exists" });
    }

    const result = await productAttributeCollection.updateOne(
      {},
      {
        $push: {
          [`productAttributes.${key}`]: {
            id: new Date().getTime().toString(),
            value: valueToSave,
          },
        },
      },
      { upsert: true }
    );

    res.send(result);
  } catch (err) {
    console.error("Error in /post-productAttribute:", err);
    res.status(500).send({ error: err.message });
  }
});

app.get("/find-productAttributes", async (req, res) => {
  try {
    const result = await productAttributeCollection.find().toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.delete("/delete-productAttribute/category/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.category": { id: id },
      },
    };

    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "Category deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "Category not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete category",
      error: error.message,
    });
  }
});
app.delete("/delete-productAttribute/subCategory/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.subCategory": { id: id },
      },
    };

    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "sub Category deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "sub Category not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete sub Category",
      error: error.message,
    });
  }
});
app.delete("/delete-productAttribute/ProductColour/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.ProductColour": { id: id },
      },
    };

    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "Color deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "Color not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete Color",
      error: error.message,
    });
  }
});
app.delete("/delete-productAttribute/productFit/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.productFit": { id: id },
      },
    };

    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "Color deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "Color not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete Color",
      error: error.message,
    });
  }
});
app.delete("/delete-productAttribute/productSize/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.productSize": { id: id },
      },
    };

    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "Color deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "Color not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete Color",
      error: error.message,
    });
  }
});
app.delete("/delete-productAttribute/brand/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.brand": { id: id },
      },
    };
    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "Color deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "Color not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete Color",
      error: error.message,
    });
  }
});
app.delete("/delete-productAttribute/sustainability/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {};
    const updateDoc = {
      $pull: {
        "productAttributes.sustainability": { id: id },
      },
    };
    const result = await productAttributeCollection.updateOne(query, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: "Color deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.status(404).send({
        success: false,
        message: "Color not found or already deleted",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to delete Color",
      error: error.message,
    });
  }
});
app.get("/find-products", async (req, res) => {
  try {
    const result = await productsCollection.find().toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.post("/post-productReview", async (req, res) => {
  try {
    const data = req.body;
    const result = await productReviewCollection.insertOne(data);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.get("/find-productReview", async (req, res) => {
  try {
    const result = await productReviewCollection.find().toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/find-single-products/:id", async (req, res) => {
  const id = req.params.id;

  const query = { _id: new ObjectId(id) };

  const result = await productsCollection.findOne(query);
  res.send(result);
});

app.get("/banners", async (req, res) => {
  try {
    const result = await bannersCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.post("/banners", bannerUpload.single("image"), async (req, res) => {
  try {
    const { subtitle, title1, title2, titleBold } = req.body;
    if (!req.file) {
      return res
        .status(400)
        .send({ success: false, error: "Image file is required." });
    }
    const imagePath = `/uploads/banners/${req.file.filename}`;
    const newBannerData = {
      subtitle,
      title1,
      title2,
      titleBold,
      image: imagePath,
      createdAt: new Date(),
    };
    const result = await bannersCollection.insertOne(newBannerData);
    res.send({ success: true, result });
  } catch (err) {
    console.error("Error saving banner:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

app.delete("/banners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bannersCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .send({ success: false, error: "Banner not found." });
    }
    res.send({ success: true, message: "Banner deleted." });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});
app.post("/add-wishlist", async (req, res) => {
  try {
    const data = req.body;
    const result = await wishListsCollection.insertOne(data);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.get("/find-wishlist", async (req, res) => {
  try {
    const result = await wishListsCollection.find().toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
app.delete("/delete-wishlist/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await wishListsCollection.deleteOne(query);
  res.send(result);
});
app.post("/api/gemini", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${errorText}`);
    }
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply)
      return res
        .status(500)
        .json({ error: "No content in response from Gemini." });

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Error in /api/gemini route:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.get("/api/gemini-models", async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=AIzaSyBKhG-mXI-DbBUsp3pHTMBctxswVztUB9M`
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/featured-products", async (req, res) => {
  try {
    const featuredProducts = await productsCollection
      .find({ productStatus: "featured" })
      .toArray();

    res.json(featuredProducts);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.get("/new-arrivals", async (req, res) => {
  try {
    const featuredProducts = await productsCollection
      .find({ productStatus: "new_arrivals" })
      .toArray();

    res.json(featuredProducts);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.get("/trending", async (req, res) => {
  try {
    const featuredProducts = await productsCollection
      .find({ productStatus: "trending" })
      .toArray();

    res.json(featuredProducts);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.post("/send-order-emails", async (req, res) => {
  try {
    const { userName, userEmail, orderInfo } = req.body;

    const adminEmail = process.env.ADMIN_EMAIL_RECEIVER;

    const adminMailOptions = {
      from: `Aaryan Sourcing Order <${process.env.GMAIL_USER}>`,
      to: adminEmail,
      subject: `New Order Alert! - Style: ${orderInfo.styleNumber}`,
      html: `
        <h1>New Order Received</h1>
        <p>A new order has been placed on your website.</p>
        <hr>
        <h3>Order Details:</h3>
        <ul>
          <li><strong>Customer Name:</strong> ${userName}</li>
          <li><strong>Customer Email:</strong> ${userEmail}</li>
          <li><strong>Style Number:</strong> ${orderInfo.styleNumber}</li>
          <li><strong>Company:</strong> ${orderInfo.company}</li>
        </ul>
        <p>Please log in to the admin dashboard for full details.</p>
      `,
    };

    const userMailOptions = {
      from: `Aaryan Sourcing <${process.env.GMAIL_USER}>`,
      to: userEmail,
      subject: `Your Order is Confirmed (Style: ${orderInfo.styleNumber})`,
      html: `
        <h1>Thank you for your order, ${userName}!</h1>
        <p>We have successfully received your order. Our team will review it and get back to you soon.</p>
        <hr>
        <h3>Your Order Summary:</h3>
        <ul>
          <li><strong>Style Number:</strong> ${orderInfo.styleNumber}</li>
        </ul>
        <p>If you have any questions, feel free to contact us.</p>
        <br>
        <p>Best Regards,</p>
        <p><strong>Aaryan Sourcing Ltd.</strong></p>
      `,
    };

    await Promise.all([
      transporter.sendMail(adminMailOptions),
      transporter.sendMail(userMailOptions),
    ]);

    res
      .status(200)
      .send({ success: true, message: "Emails sent successfully." });
  } catch (error) {
    console.error("Error sending emails via Gmail:", error);
    res.status(500).send({ success: false, message: "Failed to send emails." });
  }
});

// --- START OF THE NEW API ROUTE ---
// --- CONFIGURATION FOR YOUR PDFS ---
// 1. Define WHICH columns to show for EACH collection.
const columnConfig = {
  "all-products": {
    headers: ["Title", "Category", "Sub-Category", "Price", "Colors", "Fit"],
    keys: [
      "title",
      "productCategory",
      "productSubCategory",
      "price",
      "colors",
      "fit",
    ],
  },
  orders: {
    headers: ["Customer Name", "Email", "Phone", "Total", "Date"],
    keys: ["name", "email", "phone", "total", "date"],
  },
};
const formatCellContent = (value, key) => {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (key === "colors" && Array.isArray(value)) {
    const colorNames = value
      .filter((color) => color && typeof color.name === "string")
      .map((color) => color.name);
    return colorNames.join(", ");
  }
  if (
    ["createdAt", "updatedAt", "date"].includes(key) &&
    !isNaN(new Date(value))
  ) {
    return new Date(value).toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);

  return value.toString();
};
app.get("/download-pdf/:collectionName", async (req, res) => {
  const { collectionName } = req.params;
  const config = columnConfig[collectionName];

  if (!config) {
    return res
      .status(403)
      .send({ error: "PDF generation is not configured for this collection." });
  }
  try {
    const Db = client.db("Ayira-Database");
    const collection = Db.collection(collectionName);
    const data = await collection.find({}).toArray();

    if (data.length === 0) {
      return res
        .status(404)
        .send({ error: "No documents found in this collection." });
    }

    const body = [
      config.headers.map((header) => ({ text: header, style: "tableHeader" })),
      ...data.map((doc) =>
        config.keys.map((key) => formatCellContent(doc[key], key))
      ),
    ];

    const docDefinition = {
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [40, 60, 40, 60],
      header: {
        columns: [
          {
            text: "Aaryan Sourcing Ltd.",
            alignment: "left",
            style: "documentHeader",
          },
          {
            text: "Confidential Internal Report",
            alignment: "right",
            style: "documentHeader",
          },
        ],
        margin: [40, 20, 40, 0],
      },
      footer: function (currentPage, pageCount) {
        return {
          columns: [
            {
              text: `Generated on: ${new Date().toLocaleString()}`,
              alignment: "left",
              style: "documentFooter",
            },
            {
              text: `Page ${currentPage.toString()} of ${pageCount}`,
              alignment: "right",
              style: "documentFooter",
            },
          ],
          margin: [40, 20, 40, 0],
        };
      },
      content: [
        { text: `Data Export: ${collectionName}`, style: "header" },
        {
          style: "tableExample",
          table: {
            headerRows: 1,
            widths: Array(config.headers.length).fill("*"),
            body: body,
          },
          layout: {
            fillColor: (rowIndex) => (rowIndex % 2 === 0 ? "#F2F2F2" : null),
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#AAAAAA",
            vLineColor: () => "#AAAAAA",
          },
        },
      ],
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          margin: [0, 0, 0, 15],
          alignment: "center",
        },
        documentHeader: { fontSize: 10, color: "gray" },
        documentFooter: { fontSize: 10, color: "gray" },
        tableExample: { margin: [0, 5, 0, 15] },
        tableHeader: {
          bold: true,
          fontSize: 13,
          color: "white",
          fillColor: "#333333",
        },
      },
      defaultStyle: { font: "Helvetica" },
    };
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const fileName = `${collectionName}-export-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    res.status(500).send({ error: "An internal server error occurred." });
  }
});

app.get("/download-product-sheet/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid product ID format." });
  }

  try {
    const Db = client.db("Ayira-Database");
    const collection = Db.collection("all-products");

    const product = await collection.findOne({ _id: new ObjectId(id) });

    if (!product) {
      return res.status(404).send({ error: "Product not found." });
    }
    const productDetails = [
      { key: "Product Title", value: product.title },
      { key: "Product Code", value: product.productCode },
      { key: "GSM Code", value: product.GSM_Code },
      { key: "Category", value: product.productCategory },
      { key: "Sub-Category", value: product.productSubCategory },
      { key: "Price", value: product.price ? `$${product.price}` : "N/A" },
      { key: "Gender", value: product.Gender },
      { key: "Fit", value: product.fit },
      { key: "Sustainability", value: product.Sustainability },
      {
        key: "Available Colors",
        value: formatCellContent(product.colors, "colors"),
      },
    ];
    const body = productDetails.map((detail) => [
      { text: detail.key, bold: true },
      detail.value || "N/A",
    ]);
    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      header: {},
      footer: function (currentPage, pageCount) {},

      content: [
        { text: "Product Information Sheet", style: "header" },
        { text: product.title, style: "subheader" },
        {
          style: "detailsTable",
          table: {
            widths: [150, "*"],
            body: body,
          },
          layout: "noBorders",
        },
      ],
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          margin: [0, 0, 0, 5],
          alignment: "center",
        },
        subheader: {
          fontSize: 16,
          italics: true,
          margin: [0, 0, 0, 20],
          alignment: "center",
          color: "gray",
        },
        detailsTable: { margin: [0, 5, 0, 15] },
        documentHeader: { fontSize: 10, color: "gray" },
        documentFooter: { fontSize: 10, color: "gray" },
      },
      defaultStyle: { font: "Helvetica" },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    const fileName = `product-sheet-${product.productCode || id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error("Failed to generate single product PDF:", error);
    res.status(500).send({ error: "An internal server error occurred." });
  }
});
const adminSocketId = "admin-room";
io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  socket.on("join", (data) => {
    const { userId, role } = data;
    if (role === "admin") {
      socket.join(adminSocketId);
      console.log(`Admin ${userId} joined the admin room.`);
    } else {
      socket.join(userId);
      console.log(`User ${userId} joined room: ${userId}`);
    }
  });

  socket.on("sendMessage", async (data) => {
    try {
      const { sender, recipient, content } = data;
      if (!sender || !sender.userId || !content) {
        console.error("Invalid sendMessage payload received:", data);
        return;
      }

      const message = {
        senderId: new ObjectId(sender.userId),
        senderRole: sender.role,
        content,
        timestamp: new Date(),
      };

      const conversationUserId =
        sender.role === "admin" ? recipient.userId : sender.userId;
      if (!conversationUserId) {
        console.error("Could not determine conversation user ID.");
        return;
      }
      const conversationFilter = {
        "participants.userId": new ObjectId(conversationUserId),
      };
      const update = {
        $push: { messages: message },
        $setOnInsert: {
          participants: [
            { userId: new ObjectId(conversationUserId), role: "user" },
            { userId: null, role: "admin" },
          ],
        },
      };
      await conversationsCollection.updateOne(conversationFilter, update, {
        upsert: true,
      });
      const payload = {
        ...message,
        conversationUserId: new ObjectId(conversationUserId),
        senderName: sender.name || "Customer",
      };

      if (sender.role === "admin") {
        io.to(recipient.userId).emit("newMessage", payload);
      } else {
        io.to(adminSocketId).emit("newMessage", payload);
        io.to(adminSocketId).emit("newMessageForAdmin", payload);
      }
    } catch (err) {
      console.error("Error in sendMessage handler:", err);
      socket.emit("sendMessageError", { message: "Failed to send message." });
    }
  });
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});
app.post("/post-newsletter", async (req, res) => {
  const data = req.body;
  const existingEmail = await newsLetterCollection.findOne({
    email: data.email,
  });

  if (existingEmail) {
    return res
      .status(409)
      .send({ acknowledged: false, message: "This email already exists" });
  }
  const result = await newsLetterCollection.insertOne(data);
  res.send(result);
});
app.get("/find-newsletter", async (req, res) => {
  const result = await newsLetterCollection.find().toArray();
  res.send(result);
});
app.delete("/delete-newsletter/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await newsLetterCollection.deleteOne(query);
  res.send(result);
});
server.listen(port, () => {
  console.log("ayira server is running on port", port);
});
