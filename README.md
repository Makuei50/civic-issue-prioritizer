# CivicFix AI

You are building CivicFix AI, a hackathon MVP. Build the complete working application described below. Do not add features beyond what is listed. Do not add authentication, user accounts, or an admin panel. Speed and a working live demo matter more than completeness.



WHAT THIS APPLICATION DOES

A citizen submits a photo, a short voice note, and a location describing a civic problem, a pothole, flooded drainage, broken streetlight, and so on. The system sends the photo and a transcript of the voice note to an AI model, gets back a category, a severity score, and a confidence score, checks whether the report matches an existing one already in the database, and stores the result. A second screen shows every report ranked by severity, with matching duplicate reports grouped together, answering the question: what should get fixed first.



TECH STACK

Frontend: React with Vite, plain CSS or Tailwind, no component library required. Backend: FastAPI, Python. Database: Postgres, use Supabase as the hosted Postgres instance but do not use Supabase Auth, there are no user accounts. File storage: Supabase Storage for uploaded photos, or local disk storage if that is faster to wire up in the time available. Speech to text: any available speech to text API or local model that returns plain text from an audio file. AI model for classification: nvidia/llama-3.1-nemotron-nano-vl-8b-v1, an NVIDIA NIM vision language model, hosted on an NVIDIA Brev GPU instance. It exposes an OpenAI compatible chat completions endpoint. Build the backend to call it as an HTTP endpoint. Leave the endpoint URL and any API key as environment variables named BREV_MODEL_ENDPOINT and BREV_API_KEY, since the actual GPU deployment happens separately in the NVIDIA Brev console.



Call it like this, sending the photo as a base64 data URL alongside the transcript and location in a single messages array, and asking directly for the structured fields you need:



import base64

import requests



with open(photo_path, "rb") as f:

    image_b64 = base64.b64encode(f.read()).decode("utf-8")



response = requests.post(

    f"{BREV_MODEL_ENDPOINT}/v1/chat/completions",

    headers={"Authorization": f"Bearer {BREV_API_KEY}"} if BREV_API_KEY else {},

    json={

        "model": "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",

        "messages": [

            {

                "role": "user",

                "content": [

                    {

                        "type": "text",

                        "text": (

                            "You are reviewing a citizen report of a civic infrastructure "

                            "problem. Here is a photo, a voice transcript, and a location. "

                            f"Transcript: {transcript}. Location: {location}. "

                            "Respond only with JSON in this exact shape: "

                            '{"category": string, "severity_score": integer 1 to 10, '

                            '"confidence_score": float 0 to 1, "recommended_action": string}.'

                        ),

                    },

                    {

                        "type": "image_url",

                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},

                    },

                ],

            }

        ],

    },

)



result = response.json()["choices"][0]["message"]["content"]

# Parse result as JSON. If parsing fails, retry once with a stricter

# instruction to return JSON only, since VLMs occasionally add prose

# around the object.

Record the actual latency of this call in milliseconds and store it as latency_ms. Record "llama-3.1-nemotron-nano-vl-8b-v1" as model_name and the GPU type you deployed on, for example "L40S", as gpu_type. Do not hardcode these values, read them from the real call.



DATABASE SCHEMA

One table, named reports.



create table reports (

  id uuid primary key default gen_random_uuid(),

  tracking_code text unique,

  reporter_name text,

  reporter_phone text,

  photo_url text,

  video_url text,

  text_description text,

  transcript text,

  location text,

  category text,

  severity_score integer,

  confidence_score float,

  duplicate_of uuid references reports(id),

  model_name text,

  gpu_type text,

  latency_ms integer,

  status text default 'reported',

  created_at timestamp default now()

);

tracking_code is generated on insert, formatted as CFX-2026-0001, incrementing per report. This is how a citizen identifies their own report later. There is no account and no login, so this code is the only thing a citizen needs to keep.



BACKEND ENDPOINTS

POST /reports Accepts a multipart form with a reporter name, a reporter phone number, a location, and at least one of the following: a photo file, a video file, an audio voice note file, or a text description. Name, phone, and location are always required. At least one evidence field must be present, reject the request otherwise with a clear error message, since the model needs something to reason over. Steps:



If a photo file is present, save it and get back photo_url.

If a video file is present and no photo was provided, extract a single representative frame from partway through the video using a video processing library, save that frame as the photo_url, and also save the original video as video_url. Do not attempt to analyze motion or multiple frames, one still frame carries the visual evidence at far less build and runtime cost.

If an audio voice note is present, send it to the speech to text service and store the result in transcript.

If a text description is present, append it to transcript. If both a voice note and a text description are present, combine them, for example "Voice note: {transcript}. Written note: {text_description}."

Send whatever combination of photo_url and transcript exists to the Brev model endpoint, along with location. If no photo_url exists at all, the AI processing model in your prompt to the endpoint should be told explicitly that no image is available and to reason from text alone, and severity and confidence should be treated as lower certainty in that case.

Run a duplicate check: compare the new report's transcript and location against all existing reports using a simple text similarity function, cosine similarity on sentence embeddings if a sentence embedding library is available, otherwise a basic string similarity function is an acceptable fallback given the time constraint. If similarity is above 0.75 and location is within roughly 200 meters or the same named location string, set duplicate_of to that existing report's id.

Record model_name, gpu_type, and latency_ms based on the actual response from the Brev endpoint, do not hardcode these values.

Generate a tracking_code formatted as CFX-2026-0001, incrementing from the highest existing code in the table.

Insert the row and return it, including the tracking_code prominently in the response.

GET /reports Returns all reports ordered by severity_score descending, with duplicate reports nested under the original report they match rather than listed as separate top level entries. This is the priority queue, it is public, not tied to any one reporter.



GET /reports/track/{tracking_code} Returns the single report matching that tracking code, or a not found response if it does not exist. This is how a citizen checks their own report without an account.



POST /reports/seed A one time endpoint to load the 247 prepared demo reports from a provided JSON or CSV file into the reports table. Build this so the team can run it once before the demo to populate the database. Ask for the file path or format if it is not yet provided.



FRONTEND SCREENS

Screen one, submission. A single page with:



A text input for the reporter's name and a text input for their phone number, both required. This is the only identity information collected, there is no account.

A photo upload input, optional, accept image files, show a preview after selection.

A video upload input, optional, accept video files, show a preview after selection. If a photo is also provided, the photo takes priority and the video is stored but not processed for a frame.

A voice recording button that records audio in the browser and produces a file to upload, optional, or a fallback audio file upload input if browser recording is not working reliably.

A text area for a written description, optional.

A text input for location, required.

Client side validation that blocks submission unless at least one of photo, video, voice note, or text description is filled in, with a message explaining that some form of evidence is needed.

An Analyze button that submits the form to POST /reports and shows a loading state.

After the response comes back, display the returned category, severity score, confidence score, a note if a duplicate report was found, and the tracking_code shown clearly, telling the citizen to save this code to check their report later.

Screen three, track a report.



A single text input for a tracking code and a Look Up button.

Calls GET /reports/track/{tracking_code} and displays that report's category, severity, status, and any duplicate match.

This is the entire mechanism for a citizen to follow up on their own report. No account, no password, no session.

Screen two, priority queue.



Fetch from GET /reports on load.

Render as a list, highest severity first.

Each entry shows category, location, severity score, confidence score, and a duplicate count if other reports were merged into it.

At the top or bottom of this screen, display this exact line, unchanged: "CivicFix AI provides prioritization support. It does not make final decisions, profile individuals, or act autonomously. Low confidence results are flagged for human review." Any report with confidence_score below 0.6 should show a visible "flagged for review" label in the list.

WHAT NOT TO BUILD

Do not build login or signup. Do not build user roles. Do not build an admin dashboard. Do not build a status change workflow beyond the default status field already in the schema. Do not build a settings page. Do not build tests beyond confirming the two endpoints and two screens work end to end with real data.



WHAT TO CONFIRM WORKS BEFORE STOPPING

Submitting a real photo and a real voice note through screen one returns real values from the Brev model, not placeholder or hardcoded values.

A report that clearly matches an already seeded report gets flagged as a duplicate.

The priority queue screen correctly sorts by severity and groups duplicates.

The responsible AI line and the low confidence flag both render.

Ask before starting if the Brev model endpoint is not yet deployed and reachable, since step three of the submission flow cannot be fully tested without it. Do not let this block the rest of the build. If BREV_MODEL_ENDPOINT is unset or unreachable, the backend should return a clearly labeled mock response instead of failing, for example category "Roads", severity_score 5, confidence_score 0.5, with a mock true flag included in the response so it is never mistaken for a real result. Build and test everything else, photo upload, transcript, duplicate check, tracking code, priority queue, against that mock. The moment BREV



You are building CivicFix AI, a hackathon MVP. Build the complete working application described below. Do not add features beyond what is listed. Do not add authentication, user accounts, or an admin panel. Speed and a working live demo matter more than completeness.



WHAT THIS APPLICATION DOES

A citizen submits a photo, a short voice note, and a location describing a civic problem, a pothole, flooded drainage, broken streetlight, and so on. The system sends the photo and a transcript of the voice note to an AI model, gets back a category, a severity score, and a confidence score, checks whether the report matches an existing one already in the database, and stores the result. A second screen shows every report ranked by severity, with matching duplicate reports grouped together, answering the question: what should get fixed first.



TECH STACK

Frontend: React with Vite, plain CSS or Tailwind, no component library required. Backend: FastAPI, Python. Database: Postgres, use Supabase as the hosted Postgres instance but do not use Supabase Auth, there are no user accounts. File storage: Supabase Storage for uploaded photos, or local disk storage if that is faster to wire up in the time available. Speech to text: any available speech to text API or local model that returns plain text from an audio file. AI model for classification: nvidia/llama-3.1-nemotron-nano-vl-8b-v1, an NVIDIA NIM vision language model, hosted on an NVIDIA Brev GPU instance. It exposes an OpenAI compatible chat completions endpoint. Build the backend to call it as an HTTP endpoint. Leave the endpoint URL and any API key as environment variables named BREV_MODEL_ENDPOINT and BREV_API_KEY, since the actual GPU deployment happens separately in the NVIDIA Brev console.



Call it like this, sending the photo as a base64 data URL alongside the transcript and location in a single messages array, and asking directly for the structured fields you need:



import base64

import requests



with open(photo_path, "rb") as f:

    image_b64 = base64.b64encode(f.read()).decode("utf-8")



response = requests.post(

    f"{BREV_MODEL_ENDPOINT}/v1/chat/completions",

    headers={"Authorization": f"Bearer {BREV_API_KEY}"} if BREV_API_KEY else {},

    json={

        "model": "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",

        "messages": [

            {

                "role": "user",

                "content": [

                    {

                        "type": "text",

                        "text": (

                            "You are reviewing a citizen report of a civic infrastructure "

                            "problem. Here is a photo, a voice transcript, and a location. "

                            f"Transcript: {transcript}. Location: {location}. "

                            "Respond only with JSON in this exact shape: "

                            '{"category": string, "severity_score": integer 1 to 10, '

                            '"confidence_score": float 0 to 1, "recommended_action": string}.'

                        ),

                    },

                    {

                        "type": "image_url",

                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},

                    },

                ],

            }

        ],

    },

)



result = response.json()["choices"][0]["message"]["content"]

# Parse result as JSON. If parsing fails, retry once with a stricter

# instruction to return JSON only, since VLMs occasionally add prose

# around the object.

Record the actual latency of this call in milliseconds and store it as latency_ms. Record "llama-3.1-nemotron-nano-vl-8b-v1" as model_name and the GPU type you deployed on, for example "L40S", as gpu_type. Do not hardcode these values, read them from the real call.



DATABASE SCHEMA

One table, named reports.



create table reports (

  id uuid primary key default gen_random_uuid(),

  tracking_code text unique,

  reporter_name text,

  reporter_phone text,

  photo_url text,

  video_url text,

  text_description text,

  transcript text,

  location text,

  category text,

  severity_score integer,

  confidence_score float,

  duplicate_of uuid references reports(id),

  model_name text,

  gpu_type text,

  latency_ms integer,

  status text default 'reported',

  created_at timestamp default now()

);

tracking_code is generated on insert, formatted as CFX-2026-0001, incrementing per report. This is how a citizen identifies their own report later. There is no account and no login, so this code is the only thing a citizen needs to keep.



BACKEND ENDPOINTS

POST /reports Accepts a multipart form with a reporter name, a reporter phone number, a location, and at least one of the following: a photo file, a video file, an audio voice note file, or a text description. Name, phone, and location are always required. At least one evidence field must be present, reject the request otherwise with a clear error message, since the model needs something to reason over. Steps:



If a photo file is present, save it and get back photo_url.

If a video file is present and no photo was provided, extract a single representative frame from partway through the video using a video processing library, save that frame as the photo_url, and also save the original video as video_url. Do not attempt to analyze motion or multiple frames, one still frame carries the visual evidence at far less build and runtime cost.

If an audio voice note is present, send it to the speech to text service and store the result in transcript.

If a text description is present, append it to transcript. If both a voice note and a text description are present, combine them, for example "Voice note: {transcript}. Written note: {text_description}."

Send whatever combination of photo_url and transcript exists to the Brev model endpoint, along with location. If no photo_url exists at all, the AI processing model in your prompt to the endpoint should be told explicitly that no image is available and to reason from text alone, and severity and confidence should be treated as lower certainty in that case.

Run a duplicate check: compare the new report's transcript and location against all existing reports using a simple text similarity function, cosine similarity on sentence embeddings if a sentence embedding library is available, otherwise a basic string similarity function is an acceptable fallback given the time constraint. If similarity is above 0.75 and location is within roughly 200 meters or the same named location string, set duplicate_of to that existing report's id.

Record model_name, gpu_type, and latency_ms based on the actual response from the Brev endpoint, do not hardcode these values.

Generate a tracking_code formatted as CFX-2026-0001, incrementing from the highest existing code in the table.

Insert the row and return it, including the tracking_code prominently in the response.

GET /reports Returns all reports ordered by severity_score descending, with duplicate reports nested under the original report they match rather than listed as separate top level entries. This is the priority queue, it is public, not tied to any one reporter.



GET /reports/track/{tracking_code} Returns the single report matching that tracking code, or a not found response if it does not exist. This is how a citizen checks their own report without an account.



POST /reports/seed A one time endpoint to load the 247 prepared demo reports from a provided JSON or CSV file into the reports table. Build this so the team can run it once before the demo to populate the database. Ask for the file path or format if it is not yet provided.



FRONTEND SCREENS

Screen one, submission. A single page with:



A text input for the reporter's name and a text input for their phone number, both required. This is the only identity information collected, there is no account.

A photo upload input, optional, accept image files, show a preview after selection.

A video upload input, optional, accept video files, show a preview after selection. If a photo is also provided, the photo takes priority and the video is stored but not processed for a frame.

A voice recording button that records audio in the browser and produces a file to upload, optional, or a fallback audio file upload input if browser recording is not working reliably.

A text area for a written description, optional.

A text input for location, required.

Client side validation that blocks submission unless at least one of photo, video, voice note, or text description is filled in, with a message explaining that some form of evidence is needed.

An Analyze button that submits the form to POST /reports and shows a loading state.

After the response comes back, display the returned category, severity score, confidence score, a note if a duplicate report was found, and the tracking_code shown clearly, telling the citizen to save this code to check their report later.

Screen three, track a report.



A single text input for a tracking code and a Look Up button.

Calls GET /reports/track/{tracking_code} and displays that report's category, severity, status, and any duplicate match.

This is the entire mechanism for a citizen to follow up on their own report. No account, no password, no session.

Screen two, priority queue.



Fetch from GET /reports on load.

Render as a list, highest severity first.

Each entry shows category, location, severity score, confidence score, and a duplicate count if other reports were merged into it.

At the top or bottom of this screen, display this exact line, unchanged: "CivicFix AI provides prioritization support. It does not make final decisions, profile individuals, or act autonomously. Low confidence results are flagged for human review." Any report with confidence_score below 0.6 should show a visible "flagged for review" label in the list.

WHAT NOT TO BUILD

Do not build login or signup. Do not build user roles. Do not build an admin dashboard. Do not build a status change workflow beyond the default status field already in the schema. Do not build a settings page. Do not build tests beyond confirming the two endpoints and two screens work end to end with real data.



WHAT TO CONFIRM WORKS BEFORE STOPPING

Submitting a real photo and a real voice note through screen one returns real values from the Brev model, not placeholder or hardcoded values.

A report that clearly matches an already seeded report gets flagged as a duplicate.

The priority queue screen correctly sorts by severity and groups duplicates.

The responsible AI line and the low confidence flag both render.

Ask before starting if the Brev model endpoint is not yet deployed and reachable, since step three of the submission flow cannot be fully tested without it. Do not let this block the rest of the build. If BREV_MODEL_ENDPOINT is unset or unreachable, the backend should return a clearly labeled mock response instead of failing, for example category "Roads", severity_score 5, confidence_score 0.5, with a mock true flag included in the response so it is never mistaken for a real result. Build and test everything else, photo upload, transcript, duplicate check, tracking code, priority queue, against that mock. The moment BRE

V_MODEL_ENDPOINT is set to the real deployed instance, the same code path calls the real model with no other changes required.

_MODEL_ENDPOINT is set to the real deployed instance, the same code path calls the real model with no other changes required.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://civic-issue-prioritizer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0b26345e-026b-4de5-b578-07d3a6aa6523).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
