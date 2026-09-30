// Shared by the browser tests: open one of the learning tools in the Quiet Studio shell.
// The old tab names still work (Video, AI, Quality, Debug, Progress, Board) and map to the labels people see.
const LABEL = { Video: 'Together', AI: 'Understand', Quality: 'Code quality', Debug: 'Debug', Progress: 'Your progress', Board: 'Whiteboard' };

export async function openTool(page, name) {
  const label = LABEL[name] ?? name;
  const picker = page.locator('select[aria-label="Learning tool"]');
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Show learning panel' }).click(); // the panel was closed
  await picker.selectOption({ label });
}
