Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient

# Send the payload through localhost:3000
$json = '{
  "LessonPlanId": null,
  "SchoolId": null,
  "TeacherId": null,
  "ClassId": "6",
  "SubjectId": "mathematics",
  "ChapterId": "1228",
  "TopicId": "",
  "ClassName": "6",
  "SubjectName": "mathematics",
  "ChapterName": "Knowing Our Numbers",
  "TopicName": "Lesson Plan",
  "PlanJson": "{}",
  "PlanType": "topic",
  "Duration": null,
  "Level": null,
  "Language": null,
  "LearningStyle": null
}'

$content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
try {
    $resp = $client.PostAsync("http://localhost:3000/api/v1/smartboard/lms/lesson-plans/save", $content).Result
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Response Body: $($resp.Content.ReadAsStringAsync().Result)"
} catch {
    Write-Host "Exception: $_"
}
