// Setup fixture that always fails: `sfcli --setup` must abort with exit 1
// without running any other scenario file.
console.log("failing-setup-ran");
throw new Error("setup boom");
