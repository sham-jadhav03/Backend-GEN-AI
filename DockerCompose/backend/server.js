import express from "express";
import morgan from "morgan";

const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.status(200).json({
    message: "Hello from Server.",
  });
});

app.get("/api/users", (req, res) => {
  const data = [
    { id: 1, name: "alice" },
    { id: 2, name: "bob" },
  ];
  res.status(201).json({
    message: "some user add",
    data,
  });
});

app.listen(3000, () => {
  console.log(`Server running on 3000`);
});
