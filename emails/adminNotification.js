// emails/adminNotification.js
// Simple, readable admin notification
module.exports = function adminNotification({ name, email, start, end, location, notes }) {
  return {
    subject: "📩 New CSCoaching booking",
    text:
`New booking received

Name: ${name}
Email: ${email}
When: ${start} - ${end}
Location: ${location}
Notes: ${notes || "—"}
`
  };
};
