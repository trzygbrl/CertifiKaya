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