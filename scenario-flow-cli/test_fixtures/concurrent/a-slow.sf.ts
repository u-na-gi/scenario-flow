console.log("slow-1");
await new Promise((r) => setTimeout(r, 600));
console.log("slow-2");
