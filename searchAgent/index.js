import readline from "readline/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

while (true) {
  const userInput = await rl.question("\x1b[32mYou:\x1b[0m");

  console.log(userInput);
}

rl.close();
