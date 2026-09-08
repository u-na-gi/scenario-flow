console.log("slow-1");
await new Promise((r) => setTimeout(r, 1500));
console.log("slow-2");
