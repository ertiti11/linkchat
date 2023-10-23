import express from "express";
import morgan from "morgan";
import { Server } from "socket.io";
import { createServer } from "node:http";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

dotenv.config();

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);

const io = new Server(server, {
  connectionStateRecovery: {
    timeout: 3000,
  },
});

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    user TEXT NOT NULL DEFAULT 'Anonymous'
  );
  `);

io.on("connection", async (socket) => {
  console.log("New connection", socket.id);
  socket.on("disconnect", () => {
    console.log("Disconnected", socket.id);
  });

  socket.on("chat message", async (message, username) => {
    let result;

    try {
      result = await db.execute({
        sql: `INSERT INTO messages (content, user) VALUES (:message, :username)`,
        args: { message, username },
      });
    } catch (error) {
      console.error(error);
      return;
    }

    io.emit(
      "chat message",
      message,
      result.lastInsertRowid.toString(),
      username
    );
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: `SELECT id, content, user FROM messages WHERE id > ?`,
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      results.rows.forEach((row) => {
        socket.emit("chat message", row.content, row.id.toString(), row.user);
      });
    } catch (error) {
      console.error(error);
      return;
    }
  }
});

app.use(morgan("dev"));
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
