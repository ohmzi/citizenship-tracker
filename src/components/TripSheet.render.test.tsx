import { fireEvent, render, screen } from "@testing-library/react";
import { TripSheet } from "./TripSheet";

function setup() {
  const onClose = vi.fn();
  render(
    <TripSheet
      initial={null}
      greenCardDate="2026-09-01"
      today="2026-10-07"
      canDelete
      onSave={async () => {}}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("TripSheet dialog", () => {
  it("renders as a modal dialog named by its heading", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Add Trip" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("labels the return date plainly, with a hint, and groups the dates in a row", () => {
    setup();
    const ret = screen.getByLabelText("Return Date");
    expect(ret.closest(".date-row")).toBeTruthy();
    expect(screen.getByLabelText("Departure Date").closest(".date-row")).toBeTruthy();
    expect(screen.getByText("Leave empty only if you're abroad right now.")).toBeTruthy();
  });
});
