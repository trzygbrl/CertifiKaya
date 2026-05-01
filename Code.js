// This function runs automatically when the Google Sheet is opened
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CertifiKaya') // The name of the menu in Google Sheets
    .addItem('Open Generator Sidebar', 'showSidebar')
    .addToUi();
}

// This function renders the HTML file as a sidebar
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('CertifiKaya System')
    .setWidth(300); // Standard sidebar width

  SpreadsheetApp.getUi().showSidebar(html);
}

// Fetches the column headers from the active sheet
function getSheetHeaders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  return range.getValues()[0]; // Returns array of header strings
}

// Fetches the entire data set mapped by headers
function getSheetData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    let rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = data[i][j];
    }
    rows.push(rowObj);
  }
  return rows;
}

// Fetches the bounds and email draft stored during modal setups
function getGenerationConfig() {
  const props = PropertiesService.getUserProperties();
  return {
    bounds: props.getProperty('cert_bounds'),
    emailDraft: props.getProperty('cert_email_draft')
  };
}

// Clears the stored bounding box when a new template is uploaded
function clearBounds() {
  PropertiesService.getUserProperties().deleteProperty('cert_bounds');
}

// Opens the specialized Image Bounding Box Editor
function openTemplateEditor(base64Data) {
  const template = HtmlService.createTemplateFromFile('template_editor');
  template.imageData = base64Data;
  const html = template.evaluate()
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'Select Name Area');
}

// Opens the Certificate Preview Modal
function openPreviewDialog(base64Data) {
  const template = HtmlService.createTemplateFromFile('preview_modal');
  template.imageData = base64Data;
  const html = template.evaluate()
    .setWidth(900)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'Certificate Preview');
}

// Save bounding box coordinates from modal to User Properties for this session
function saveBoundingBox(boundsStr) {
  PropertiesService.getUserProperties().setProperty('cert_bounds', boundsStr);
}

// Opens the Email Composition Editor
function openEmailEditor() {
  const html = HtmlService.createHtmlOutputFromFile('email_editor')
    .setWidth(600)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, 'Draft Distribution Email');
}

// Save email draft from modal to User Properties
function saveEmailDraft(draftStr) {
  PropertiesService.getUserProperties().setProperty('cert_email_draft', draftStr);
}

// Main processing function called sequentially by the frontend
function processAndSaveCertificate(payload) {
  const { base64Data, format, participantName, participantEmail, collegeProgram, subject, body, eventId, eventName, eventDate } = payload;

  // 1. Process base64 back into a file blob
  const dataParts = base64Data.split(',');
  const bytes = Utilities.base64Decode(dataParts[1] || dataParts[0]);

  const mimeType = format === 'pdf' ? 'application/pdf' : (format === 'png' ? 'image/png' : 'image/jpeg');
  const blob = Utilities.newBlob(bytes, mimeType, `${participantName}_Certificate.${format}`);

  // 2. Save to Drive into a structured Event folder
  const folderName = `${eventName} (${eventDate})`;
  let folder;
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  const savedFile = folder.createFile(blob);
  const fileUrl = savedFile.getUrl();

  // 3. Send Email
  let deliveryStatus = 'Pending';
  try {
    if (participantEmail && participantEmail != "") {
      MailApp.sendEmail({
        to: participantEmail,
        subject: subject || "Your Certificate",
        htmlBody: body || "Attached is your certificate. Thank you!",
        attachments: [blob]
      });
      deliveryStatus = 'Sent';
    } else {
      deliveryStatus = 'Failed'; // No email address
    }
  } catch (e) {
    deliveryStatus = 'Failed';
  }

  // 4. Log to Database
  logToDatabase(eventId, participantName, participantEmail, collegeProgram, fileUrl, deliveryStatus);

  return { status: deliveryStatus };
}

// Ensure the user exists in DB, returns user_id
function getOrCreateUserAccount(conn, email) {
  let stmt = conn.prepareStatement("SELECT user_id FROM users WHERE google_email = ?");
  stmt.setString(1, email);
  let rs = stmt.executeQuery();
  if (rs.next()) return rs.getInt(1);

  // Insert if not exists
  let insert = conn.prepareStatement("INSERT INTO users (google_email) VALUES (?)", Jdbc.Statement.RETURN_GENERATED_KEYS);
  insert.setString(1, email);
  insert.executeUpdate();
  let keys = insert.getGeneratedKeys();
  if (keys.next()) return keys.getInt(1);
  return null;
}

// Sets up the DB records before batch generation
function initializeEvent(eventName, eventDate, base64img, templateName, existingTemplateId) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  if (!dbPassword) return { error: "Database not configured." };

  const userEmail = Session.getActiveUser().getEmail() || "anonymous@example.com";
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    const userId = getOrCreateUserAccount(conn, userEmail);

    let templateId = existingTemplateId;

    if (!templateId) {
      // Save custom template to drive to get a URL link
      let templateLink = "";
      try {
        const dataParts = base64img.split(',');
        const bytes = Utilities.base64Decode(dataParts[1] || dataParts[0]);
        const mimeType = 'image/png'; // Assuming upload is strictly image
        const blob = Utilities.newBlob(bytes, mimeType, templateName + ".png");

        const folderName = "CertifiKaya_Templates_" + userEmail;
        let tFolder;
        const folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) {
          tFolder = folders.next();
        } else {
          tFolder = DriveApp.createFolder(folderName);
        }
        templateLink = tFolder.createFile(blob).getUrl();
      } catch (e) { Logger.log("Drive Upload Error: " + e.message); }

      // Insert Template
      let tStmt = conn.prepareStatement("INSERT INTO certificate_templates (template_name, file_path, uploaded_by) VALUES (?, ?, ?)", Jdbc.Statement.RETURN_GENERATED_KEYS);
      tStmt.setString(1, templateName);
      tStmt.setString(2, templateLink);
      tStmt.setInt(3, userId);
      tStmt.executeUpdate();
      let keys = tStmt.getGeneratedKeys();
      if (keys.next()) templateId = keys.getInt(1);
    }

    // Insert Event
    let eStmt = conn.prepareStatement("INSERT INTO events (event_name, event_date, template_id, created_by) VALUES (?, ?, ?, ?)", Jdbc.Statement.RETURN_GENERATED_KEYS);
    eStmt.setString(1, eventName);
    eStmt.setString(2, eventDate);
    eStmt.setInt(3, templateId || null);
    eStmt.setInt(4, userId);
    eStmt.executeUpdate();
    let eKeys = eStmt.getGeneratedKeys();
    let eventId = -1;
    if (eKeys.next()) eventId = eKeys.getInt(1);

    conn.close();
    return { eventId: eventId, templateId: templateId };

  } catch (e) {
    return { error: "DB Err: " + e.message };
  }
}


function logToDatabase(eventId, name, email, program, fileLink, status) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  if (!dbPassword) return; // Skip if no DB password set

  const userEmail = Session.getActiveUser().getEmail() || "anonymous@example.com";
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    const userId = getOrCreateUserAccount(conn, userEmail);

    // Insert Participant
    const stmt = conn.prepareStatement("INSERT INTO participants (event_id, full_name, email_address, college_program) VALUES (?, ?, ?, ?)", Jdbc.Statement.RETURN_GENERATED_KEYS);
    stmt.setInt(1, eventId || 1);
    stmt.setString(2, name);
    stmt.setString(3, email);
    stmt.setString(4, program);
    stmt.executeUpdate();

    const keys = stmt.getGeneratedKeys();
    let participantId = 1;
    if (keys.next()) participantId = keys.getInt(1);

    // Insert Log 
    const logStmt = conn.prepareStatement("INSERT INTO generation_logs (participant_id, processed_by, processing_timestamp, issue_timestamp, certificate_link, delivery_status) VALUES (?, ?, NOW(), NOW(), ?, ?)");
    logStmt.setInt(1, participantId);
    logStmt.setInt(2, userId);
    logStmt.setString(3, fileLink);
    logStmt.setString(4, status);
    logStmt.executeUpdate();

    conn.close();
  } catch (e) {
    Logger.log("DB Log Error: " + e.message);
  }
}

// Verifies the dashboard access password stored in Script Properties
function verifyDashboardPassword(password) {
  const stored = PropertiesService.getScriptProperties().getProperty('dashboard_password');
  return !!(stored && password === stored);
}

// Fetches ALL generation logs (no user filter) for the admin dashboard
function fetchAllGenerationLogs() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    const stmt = conn.prepareStatement(
      "SELECT p.full_name, p.email_address, p.college_program, l.processing_timestamp, l.certificate_link, l.delivery_status, u.google_email, p.event_id " +
      "FROM generation_logs l " +
      "JOIN participants p ON l.participant_id = p.participant_id " +
      "JOIN users u ON l.processed_by = u.user_id " +
      "ORDER BY l.processing_timestamp DESC LIMIT 500"
    );
    const rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({
        name: rs.getString(1),
        email: rs.getString(2),
        college: rs.getString(3),
        timestamp: rs.getString(4),
        link: rs.getString(5),
        status: rs.getString(6),
        processedBy: rs.getString(7),
        eventId: rs.getInt(8)
      });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

// Fetches ALL events (no user filter) for the admin dashboard
function fetchAllEvents() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    const stmt = conn.prepareStatement(
      "SELECT e.event_id, e.event_name, e.event_date, t.template_name, u.google_email " +
      "FROM events e " +
      "LEFT JOIN certificate_templates t ON e.template_id = t.template_id " +
      "JOIN users u ON e.created_by = u.user_id " +
      "ORDER BY e.event_date DESC LIMIT 200"
    );
    const rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({ id: rs.getInt(1), name: rs.getString(2), date: rs.getString(3), template: rs.getString(4), createdBy: rs.getString(5) });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

// Fetches ALL templates (no user filter) for the admin dashboard
function fetchAllTemplates() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    const stmt = conn.prepareStatement(
      "SELECT t.template_id, t.template_name, t.upload_timestamp, t.file_path, u.google_email " +
      "FROM certificate_templates t " +
      "JOIN users u ON t.uploaded_by = u.user_id " +
      "ORDER BY t.upload_timestamp DESC LIMIT 200"
    );
    const rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({ id: rs.getInt(1), name: rs.getString(2), date: rs.getString(3), link: rs.getString(4), uploadedBy: rs.getString(5) });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

// Serves the Web App page for Generation Logs
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('logs_dashboard')
    .setTitle('CertifiKaya - Generation Logs')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Fetches logs from database for the dashboard
function fetchGenerationLogs() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;
  const userEmail = Session.getActiveUser().getEmail() || "anonymous@example.com";

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);

    let stmt = conn.prepareStatement(
      "SELECT p.full_name, p.email_address, p.college_program, l.processing_timestamp, l.certificate_link, l.delivery_status " +
      "FROM generation_logs l " +
      "JOIN participants p ON l.participant_id = p.participant_id " +
      "JOIN users u ON l.processed_by = u.user_id " +
      "WHERE u.google_email = ? " +
      "ORDER BY l.processing_timestamp DESC LIMIT 100"
    );
    stmt.setString(1, userEmail);

    let rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({
        name: rs.getString(1),
        email: rs.getString(2),
        college: rs.getString(3),
        timestamp: rs.getString(4),
        link: rs.getString(5),
        status: rs.getString(6)
      });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

// Fetch Events for the dashboard
function fetchEvents() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const userEmail = Session.getActiveUser().getEmail() || "anonymous@example.com";
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    let stmt = conn.prepareStatement(
      "SELECT e.event_name, e.event_date, t.template_name " +
      "FROM events e " +
      "JOIN certificate_templates t ON e.template_id = t.template_id " +
      "JOIN users u ON e.created_by = u.user_id " +
      "WHERE u.google_email = ? " +
      "ORDER BY e.event_date DESC LIMIT 50"
    );
    stmt.setString(1, userEmail);
    let rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({ name: rs.getString(1), date: rs.getString(2), template: rs.getString(3) });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

// Fetch Templates for the dashboard
function fetchTemplates() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const userEmail = Session.getActiveUser().getEmail() || "anonymous@example.com";
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    let stmt = conn.prepareStatement(
      "SELECT t.template_name, t.upload_timestamp, t.file_path " +
      "FROM certificate_templates t " +
      "JOIN users u ON t.uploaded_by = u.user_id " +
      "WHERE u.google_email = ? " +
      "ORDER BY t.upload_timestamp DESC LIMIT 50"
    );
    stmt.setString(1, userEmail);
    let rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({ name: rs.getString(1), date: rs.getString(2), link: rs.getString(3) });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

function deleteEvent(eventId) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    
    // Optional: Delete logs and participants associated with the event to avoid foreign key constraints
    let stmt1 = conn.prepareStatement("DELETE FROM generation_logs WHERE participant_id IN (SELECT participant_id FROM participants WHERE event_id = ?)");
    stmt1.setInt(1, eventId);
    stmt1.executeUpdate();
    
    let stmt2 = conn.prepareStatement("DELETE FROM participants WHERE event_id = ?");
    stmt2.setInt(1, eventId);
    stmt2.executeUpdate();
    
    // Delete event
    let stmt3 = conn.prepareStatement("DELETE FROM events WHERE event_id = ?");
    stmt3.setInt(1, eventId);
    stmt3.executeUpdate();
    
    conn.close();
    return true;
  } catch (e) {
    Logger.log("Delete Event Error: " + e.message);
    return false;
  }
}

function deleteTemplate(templateId) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    
    // First, fetch the file link to delete from Drive
    let fileLink = null;
    let getStmt = conn.prepareStatement("SELECT file_path FROM certificate_templates WHERE template_id = ?");
    getStmt.setInt(1, templateId);
    let rs = getStmt.executeQuery();
    if (rs.next()) {
      fileLink = rs.getString(1);
    }
    
    // Update events to null out the template before deleting to prevent constraint errors
    let uStmt = conn.prepareStatement("UPDATE events SET template_id = NULL WHERE template_id = ?");
    uStmt.setInt(1, templateId);
    uStmt.executeUpdate();
    
    // Delete from DB
    let stmt = conn.prepareStatement("DELETE FROM certificate_templates WHERE template_id = ?");
    stmt.setInt(1, templateId);
    stmt.executeUpdate();
    conn.close();
    
    // Try to delete from Drive
    if (fileLink) {
      const match = fileLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        try {
          DriveApp.getFileById(match[1]).setTrashed(true);
        } catch (e) {
          Logger.log("Error trashing file from Drive: " + e.message);
        }
      }
    }
    
    return true;
  } catch (e) {
    Logger.log("Delete Template Error: " + e.message);
    return false;
  }
}

function testDatabaseConnection() {
  // 1. Open the secure vault
  const scriptProperties = PropertiesService.getScriptProperties();

  // 2. Fetch the hidden credentials
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const dbHost = 'mysql-18e17a2d-certifikaya.g.aivencloud.com';
  const dbUser = 'avnadmin';
  const dbPort = '12448';
  const dbName = 'defaultdb'; // This is safe to leave hardcoded as it's not a secret

  // 3. Format the JDBC connection string using the fetched variables
  const url = `jdbc:mysql://${dbHost}:${dbPort}/${dbName}`;

  try {
    // 4. Attempt the connection
    const connection = Jdbc.getConnection(url, dbUser, dbPassword);

    Logger.log("Success! Securely connected to the Aiven database.");
    connection.close();

  } catch (err) {
    Logger.log("Connection Failed: " + err.message);
  }
}

// Fetch templates uploaded by current user
function getUserTemplates() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  if (!dbPassword) return [];
  const userEmail = Session.getActiveUser().getEmail() || "anonymous@example.com";
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;

  const results = [];
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    let stmt = conn.prepareStatement(
      "SELECT t.template_id, t.template_name " +
      "FROM certificate_templates t " +
      "JOIN users u ON t.uploaded_by = u.user_id " +
      "WHERE u.google_email = ? " +
      "ORDER BY t.upload_timestamp DESC"
    );
    stmt.setString(1, userEmail);
    let rs = stmt.executeQuery();
    while (rs.next()) {
      results.push({ id: rs.getInt(1), name: rs.getString(2) });
    }
    conn.close();
  } catch (e) { Logger.log(e); }
  return results;
}

// Fetch base64 string of an existing template from Drive
function getTemplateBase64(templateId) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const dbPassword = scriptProperties.getProperty('dbpassword');
  const url = `jdbc:mysql://mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`;
  let fileUrl = "";
  try {
    const conn = Jdbc.getConnection(url, 'avnadmin', dbPassword);
    let stmt = conn.prepareStatement("SELECT file_path FROM certificate_templates WHERE template_id = ?");
    stmt.setInt(1, templateId);
    let rs = stmt.executeQuery();
    if (rs.next()) {
       fileUrl = rs.getString(1);
    }
    conn.close();
  } catch(e) { Logger.log(e); }

  if (!fileUrl) return null;

  const match = fileUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    try {
      const file = DriveApp.getFileById(match[1]);
      const bytes = file.getBlob().getBytes();
      const b64 = Utilities.base64Encode(bytes);
      return "data:" + file.getMimeType() + ";base64," + b64;
    } catch(e) { Logger.log(e); }
  }
  return null;
}