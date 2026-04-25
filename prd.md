# Product Requirements Document (PRD)

**Project Name:** CertifiKaya - Library Certificate Generator System

**Client:** Angeles University Foundation (AUF) University Library

**Course:** CCS05 - Information Management

**Development Team:** Trizy Gabriel N. Nicdao, Kyle L. Contreras, Alec Ezekiel M. Dela Peña, Galvin C. Venturina

# 1\. Product Overview & Objectives

CertifiKaya is a database-backed Google Sheets extension designed to automate the generation and distribution of certificates for the AUF University Library. The overarching objective of this architecture is to make the certificate generation process faster and easier for the staff. It aims to resolve operational inefficiencies by replacing tools like AutoCrat, which frequently fail when handling large datasets.

# 2\. Problem Statement

The AUF University Library frequently organizes seminars and camps to enhance stakeholders' research capabilities. Documenting participation for these events requires generating a large volume of certificates. However, current automation tools encounter frequent errors and fail to process certificates when working with large datasets. This forces library staff to manually input details, leading to significant time and effort expenditures and late certificate distribution. Furthermore, the unstructured approach of relying on basic cloud storage and Google Sheets makes tracking reports, monitoring delivery statuses, and archiving older certificates difficult.

# 3\. Functional Requirements

## 3.1. System Architecture & Authentication

- The solution must be developed exclusively as an extension for Google Sheets.
- The user interface must be displayed as a sidebar on the right side of the screen.
- The system will act as an extension and not a separate application.
- Access to the main extension must be managed entirely through Google Login.
- No custom login form is required for generating certificates.
- The authentication system must allow different library staff members to log in and use their respective email addresses as the sender of the certificates.
- The standalone logs dashboard must be protected by a password gate, allowing any authorized staff member with the password to view all system-wide records.

## 3.2. Data Source & Processing

- The system must pull participant data directly from the active Google Sheet, which is populated via Google Forms.
- The extension must efficiently process batch sizes ranging from a minimum of 6 to a maximum of 700 certificates per event.

## 3.3. Certificate Generation & Templates

- The system must accommodate uploaded custom certificate designs, as the library does not use a static template.
- When a custom design is uploaded, the system must dynamically overlay only the participant's name.
- Pre-rendered details on the uploaded design (e.g., date, title, location, signatories) must not be altered by the system.
- Text injection must not force capitalization to ensure cursive fonts render correctly.
- The extension must also include proposed, editable certificate templates provided by the development team.

## 3.4. Email Distribution

- The system must automate the emailing of certificates to participants within the same day the seminar concludes.
- Staff must have the ability to edit the content of the distribution email before initiating the batch send.

## 3.5. Tracking, Reporting & Sorting

- The system must implement a centralized 'Generation Log' with real-time status tracking via a standalone web dashboard.
- The dashboard must be protected by a password gate that, upon successful entry, allows users to view **ALL** system logs, events, and templates globally, overcoming the default Google account email data scoping.
- Library staff must be able to immediately identify and re-process specific failed entries without manual data re-entry.
- The system must generate a report capturing specific data points: processing timestamp, issue timestamp, recipient name, recipient email, college/program, the direct link to the stored certificate, and the exact delivery status.
- The database must implement a sorting mechanism that allows users to filter logs based on the colleges or programs involved.
- Staff must be able to sort and filter the generation logs specifically by the participants' college or program.

## 3.6. Storage & Archiving

- All generated certificates must be stored centrally in a designated Google Drive folder.
- The system requires an automated notification feature to alert staff when a batch of cloud-stored certificates reaches three years old.
- This notification will signal staff to transfer those older files to a hard drive.
- The system's generation logs and reports must remain stored in the cloud, even after certificates are moved to hard drives.

## 4\. Non-Functional Requirements

- **User Interface:** The frontend design should be minimalist, specifically incorporating blue accents.
- **Scalability & Reliability:** The shift from flat-file spreadsheets to a structured database architecture must ensure high availability and scalability, minimizing the risk of automation failure due to dataset size.
- **Data Integrity:** The proposed system must utilize a relational structure that enforces data integrity through unique identifiers and foreign key constraints.

## 5\. Entity Specifications

The database will contain tables to store key information. The initial entities include:

- **User (Library Staff):** Records the details of the staff members who access the extension to generate and send certificates.
- **Event:** Records the details of the specific activities the library is hosting.
- **Participant:** Stores the information of the attendees of an event.
- **Generation Log:** Stores the specific details, timestamps, and email delivery statuses of each certificate's generation and issuance.
- **Certificate Template:** Stores the file path of the design template.

# Entity Attributes

1\. User (Library Staff) Since the system relies entirely on Google Login without a custom login form, we only need to store their Google email and a unique ID.

- user_id (Primary Key)
- google_email: The email address used to log in and send the certificates.

2\. Certificate Template This stores the details of both the uploaded custom designs and the proposed templates.

- template_id (Primary Key)
- template_name: A recognizable name for the staff.
- file_path: The location of the design template.
- uploaded_by: (Foreign Key -> User) Tracks which staff member uploaded the design.

3\. Event Records the specific seminars or camps the library hosts.

- event_id (Primary Key)
- event_name: The title of the activity.
- event_date: When the event took place.
- template_id: (Foreign Key -> Certificate Template) Links the specific design chosen for this event.
- created_by: (Foreign Key -> User) Tracks which staff member created the event record.

4\. Participant Stores data pulled from the Google Sheets/Forms.

- participant_id (Primary Key)
- event_id: (Foreign Key -> Event) Links the participant to the specific seminar.
- full_name: The recipient's name to be overlaid on the certificate.
- email_address: Needed for the automated email distribution.
- college_program: Crucial for the system's required sorting and filtering functionality.

5\. Generation Log This is the central tracking table. It records the automated processing and distribution status.

- log_id (Primary Key)
- participant_id: (Foreign Key -> Participant) Identifies whose certificate this log belongs to.
- processed_by: (Foreign Key -> User) Identifies the staff member who initiated the batch send.
- processing_timestamp: When the system started generating the certificate.
- issue_timestamp: When the certificate was actually emailed out.
- certificate_link: The direct Google Drive link to the stored file.
- delivery_status: Tracks if the email was "Sent" or "Failed".

# SQL QUERY

\-- Create Users Table

CREATE TABLE users (

user_id INT AUTO_INCREMENT PRIMARY KEY,

google_email VARCHAR(255) UNIQUE NOT NULL,

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);

\-- Create Certificate Templates Table

CREATE TABLE certificate_templates (

template_id INT AUTO_INCREMENT PRIMARY KEY,

template_name VARCHAR(255) NOT NULL,

file_path VARCHAR(500) NOT NULL,

uploaded_by INT,

upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE SET NULL

);

\-- Create Events Table

CREATE TABLE events (

event_id INT AUTO_INCREMENT PRIMARY KEY,

event_name VARCHAR(255) NOT NULL,

event_date DATE NOT NULL,

template_id INT,

created_by INT,

FOREIGN KEY (template_id) REFERENCES certificate_templates(template_id) ON DELETE SET NULL,

FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL

);

\-- Create Participants Table

CREATE TABLE participants (

participant_id INT AUTO_INCREMENT PRIMARY KEY,

event_id INT NOT NULL,

full_name VARCHAR(255) NOT NULL,

email_address VARCHAR(255) NOT NULL,

college_program VARCHAR(150) NOT NULL,

FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE

);

\-- Create Generation Logs Table

CREATE TABLE generation_logs (

log_id INT AUTO_INCREMENT PRIMARY KEY,

participant_id INT NOT NULL,

processed_by INT NOT NULL,

processing_timestamp DATETIME NOT NULL,

issue_timestamp DATETIME,

certificate_link VARCHAR(500),

delivery_status ENUM('Sent', 'Failed', 'Pending') NOT NULL DEFAULT 'Pending',

FOREIGN KEY (participant_id) REFERENCES participants(participant_id) ON DELETE CASCADE,

FOREIGN KEY (processed_by) REFERENCES users(user_id) ON DELETE RESTRICT

);