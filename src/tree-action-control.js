export function createTreeActionControl({
  fileControl,
  shareTrigger,
  initiallyShareable = false
}) {
  if (!fileControl || !shareTrigger) {
    throw new Error('Tree action control requires Import and Share elements.');
  }

  function render(showShare) {
    fileControl.hidden = showShare;
    shareTrigger.hidden = !showShare;
  }

  render(initiallyShareable);

  return {
    showShare() {
      render(true);
    }
  };
}
