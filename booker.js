const { chromium } = require('playwright');
const { Resend } = require('resend');

require('dotenv').config();

const USERNAME = process.env.CALGARY_USERNAME;
const PASSWORD = process.env.CALGARY_PASSWORD;

// All slots to consider in order, starting from 5 PM.
// startVal/endVal are the <select> option values used by the site (minutes since midnight).
const SLOTS = [
  { startVal: '1020', endVal: '1080', label: '05:00 PM' },
  { startVal: '1080', endVal: '1140', label: '06:00 PM' },
  { startVal: '1140', endVal: '1200', label: '07:00 PM' },
  { startVal: '1200', endVal: '1260', label: '08:00 PM' },
];

async function sendSuccess(first, second) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: process.env.NOTIFY_EMAIL,
    subject: 'Court booked — complete payment now',
    text: [
      `${first.label} and ${second.label} courts are in your cart for ${targetColDate}.`,
      '',
      'The Chromium browser on your computer is open and waiting.',
      'Go to the browser and complete the payment.',
    ].join('\n'),
  });
  console.log('Success notification sent.');
}

async function sendUnavailable() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: process.env.NOTIFY_EMAIL,
    subject: `No consecutive courts available on ${targetColDate}`,
    text: [
      `No two consecutive slots between 5:00 PM and 8:00 PM are available on ${targetColDate}.`,
      '',
      'You may want to check the site manually for alternatives.',
    ].join('\n'),
  });
  console.log('Unavailability notification sent.');
}

// Today + 30 days = the date we want to book (e.g. today May 3 → target June 2)
const today = new Date();
const target = new Date(today);
target.setDate(today.getDate() + 30);

const targetDay = target.getDate();

// How many times to click "Next" in the calendar to reach the target month
const monthsToAdvance =
  (target.getFullYear() - today.getFullYear()) * 12 +
  (target.getMonth() - today.getMonth());

// YYYY-MM-DD — matches the column header format in the results table
const targetColDate = [
  target.getFullYear(),
  String(target.getMonth() + 1).padStart(2, '0'),
  String(target.getDate()).padStart(2, '0'),
].join('-');

// Opens the calendar picker, advances to the target month, and clicks the target day.
// exact:true prevents e.g. '2' from matching '12' or '22'.
async function pickDate(page) {
  await page.getByRole('button').filter({ hasText: /^$/ }).click();
  for (let i = 0; i < monthsToAdvance; i++) {
    await page.getByTitle('Next').click();
  }
  await page.getByRole('link', { name: String(targetDay), exact: true }).click();
}

// Loads the availability form with a wide time range (5 PM–9 PM) so all
// possible slots are visible in a single results table.
async function loadAvailability(page) {
  await page.goto('https://liveandplay.calgary.ca/REGPROG/public/category/browse/TennisCourtBookings');
  await page.getByRole('link', { name: 'More ' }).nth(3).click();
  await pickDate(page);
  await page.getByLabel('Start', { exact: true }).selectOption('1020'); // 5:00 PM
  await page.getByLabel('End').selectOption('1260');                    // 9:00 PM
  await page.getByLabel('Venue').selectOption('f35d4dcd-0483-4399-abff-f3817d67a6c5');
  await page.getByLabel('Location').selectOption('04eae12f-61eb-4c2a-9b0c-8ccb4a7d68d9');
  await page.getByRole('button', { name: 'Check Availability' }).click();
  // Wait for the target date column to appear before reading slot statuses
  await page.locator(`th:has-text("${targetColDate}")`).waitFor({ state: 'visible' });
}

// Returns the column index of the target date in the results table header.
async function getTargetColIndex(page) {
  return await page.locator(`th:has-text("${targetColDate}")`).evaluate(
    th => Array.from(th.parentElement.children).indexOf(th) + 1
  );
}

// Checks a single slot's status in the target date column.
// Returns: 'available' | 'unavailable' | 'closed' (row missing = court closed early)
async function getSlotStatus(page, colIndex, slot) {
  const row = page.locator('tr').filter({ hasText: slot.label });
  if (await row.count() === 0) return 'closed';  // row absent = court closed at this hour

  const cell = row.locator(`td:nth-child(${colIndex})`);
  if (await cell.count() === 0) return 'closed';
  if (await cell.locator('text=Unavailable').isVisible()) return 'unavailable';
  return 'available';
}

// Scans SLOTS in order and returns the first pair of consecutive available slots.
// Returns null if no such pair exists.
async function findAvailablePair(page) {
  const colIndex = await getTargetColIndex(page);
  for (let i = 0; i < SLOTS.length - 1; i++) {
    const firstStatus  = await getSlotStatus(page, colIndex, SLOTS[i]);
    const secondStatus = await getSlotStatus(page, colIndex, SLOTS[i + 1]);

    console.log(`${SLOTS[i].label}: ${firstStatus} | ${SLOTS[i + 1].label}: ${secondStatus}`);

    if (firstStatus === 'available' && secondStatus === 'available') {
      return { first: SLOTS[i], second: SLOTS[i + 1] };
    }
    // If the second slot is closed, the court is done for the day — stop scanning
    if (secondStatus === 'closed') break;
  }
  return null;
}

// Navigates to the booking form, fills it for the given slot, and clicks Book.
// The site auto-redirects to the basket after a successful booking.
async function bookSlot(page, slot) {
  await page.goto('https://liveandplay.calgary.ca/REGPROG/public/category/browse/TennisCourtBookings');
  await page.getByRole('link', { name: 'More ' }).nth(3).click();
  await pickDate(page);
  await page.getByLabel('Start', { exact: true }).selectOption(slot.startVal);
  await page.getByLabel('End').selectOption(slot.endVal);
  await page.getByLabel('Venue').selectOption('f35d4dcd-0483-4399-abff-f3817d67a6c5');
  await page.getByLabel('Location').selectOption('04eae12f-61eb-4c2a-9b0c-8ccb4a7d68d9');
  await page.getByRole('button', { name: 'Check Availability' }).click();

  // Target the exact date column to avoid booking the wrong date
  const colIndex = await getTargetColIndex(page);
  const row = page.locator('tr').filter({ hasText: slot.label });
  await row.first().waitFor({ state: 'visible' });
  await row.locator(`td:nth-child(${colIndex}) .td-grid`).click();
  await page.waitForURL('**/Basket**');
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // --- Login ---
    await page.goto('https://liveandplay.calgary.ca/REGPROG/public/category/browse/TennisCourtBookings');
    await page.getByRole('link', { name: ' Logon' }).click();
    await page.getByRole('textbox', { name: 'Email Address *' }).click();
    await page.getByRole('textbox', { name: 'Email Address *' }).fill(USERNAME);
    await page.getByRole('textbox', { name: 'Password *' }).click();
    await page.getByRole('textbox', { name: 'Password *' }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Logon' }).click();

    // --- Check availability for all slots (5 PM–9 PM) in one pass ---
    await loadAvailability(page);
    const pair = await findAvailablePair(page);

    if (!pair) {
      console.log('No consecutive slots available. Sending notification.');
      await sendUnavailable();
      await browser.close();
      return;
    }

    console.log(`Booking: ${pair.first.label} and ${pair.second.label}`);

    // --- Book first slot ---
    await bookSlot(page, pair.first);
    // Continue Shopping navigates back to TennisCourtBookings — wait for it
    await page.getByRole('link', { name: 'Continue Shopping' }).click();
    await page.waitForURL('**/TennisCourtBookings**');

    // --- Book second slot ---
    await bookSlot(page, pair.second);

    // --- Done: both slots in cart ---
    await sendSuccess(pair.first, pair.second);
    console.log('Both slots booked. Go to the Chromium window to pay, then close it.');
    await page.waitForEvent('close', { timeout: 5 * 60 * 1000 }); // timeout after 5 minutes
  } catch (err) {
    console.error('Booker failed:', err.message);
    console.error('Browser staying open so you can inspect the current state.');
    await page.waitForEvent('close');
  }

  await browser.close();
})();
