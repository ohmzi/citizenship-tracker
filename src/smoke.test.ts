describe("toolchain", () => {
  it("runs tests in jsdom", () => {
    expect(typeof document.createElement).toBe("function");
  });
});
