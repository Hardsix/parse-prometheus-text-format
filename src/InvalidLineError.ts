export class InvalidLineError extends Error {
  constructor(message: string) {
    super("Encountered invalid line: " + message);
    Object.defineProperty(this, "name", {
      value: "InvalidLineError",
    });
  }
}
