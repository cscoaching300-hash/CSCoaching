module.exports = function customerConfirmationTemplate({ name, date, startTime, endTime, location, creditsLeft }) {
  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#000000;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000000;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0"
              style="width:600px;max-width:100%;background:#0f0f0f;border:1px solid #1a1a1a;border-radius:12px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:20px 0 12px;">
                  <img src="cid:logo" alt="CSCoaching" 
     			style="max-width:100%;height:auto;border-radius:8px;" />
                </td>
              </tr>

              <!-- Branding -->
              <tr>
                <td align="center" style="padding:0 16px 12px;">
                  <div style="font-size:24px;font-weight:700;letter-spacing:.5px;color:#ffffff;">CSCoaching</div>
                  <div style="color:#d0d0d0;margin-top:4px;">Train. Strike. Repeat.</div>
                </td>
              </tr>

              <tr><td style="height:1px;background:#1a1a1a;"></td></tr>

              <!-- Greeting -->
              <tr>
                <td style="padding:20px 18px 4px;font-size:16px;line-height:1.5;">
                  <p style="margin:0 0 12px;">Hi <strong>${name}</strong>,</p>
                  <p style="margin:0 0 16px;">Your coaching session is <span style="color:#31c553;">confirmed</span> ✅</p>
                </td>
              </tr>

              <!-- Session Details -->
              <tr>
                <td style="padding:0 18px 8px;">
                  <table role="presentation" width="100%"
                    style="background:#0b0b0b;border:1px solid #1a1a1a;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 14px 0;font-size:14px;color:#d0d0d0;">When</td>
                    </tr>
                    <tr>
                      <td style="padding:0 14px 10px;font-size:16px;color:#ffffff;">
                        <strong>${date}, ${startTime}</strong> – ${endTime}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 14px 0;font-size:14px;color:#d0d0d0;">Location</td>
                    </tr>
                    <tr>
                      <td style="padding:0 14px 14px;font-size:16px;color:#ffffff;">
                        <strong>${location}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 14px 14px;font-size:14px;color:#ffffff;">
                        <span style="display:inline-block;background:#121212;border:1px solid #1a1a1a;border-radius:8px;padding:6px 10px;">
                          Remaining session credits: <strong style="color:#e02424;">${creditsLeft}</strong>
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:14px 18px 22px;font-size:12px;color:#b5b5b5;line-height:1.5;">
                  <p style="margin:0 0 8px;">Need to reschedule? Reply to this email and we’ll sort it.</p>
                  <p style="margin:0;">© CSCoaching • All rights reserved</p>
                </td>
              </tr>
            </table>
            <div style="height:24px;"></div>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};
