Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$json = '{"LessonPlanId":null,"SchoolId":null,"TeacherId":null,"ClassName":"Grade 6","SubjectName":"Math","ChapterName":"Numbers","TopicName":"Test Topic","PlanJson":"{}","PlanType":"topic"}'
$content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
$resp = $client.PostAsync('http://localhost:5105/api/v1/smartboard/lms/lesson-plans/save', $content).Result
Write-Host "Status: $($resp.StatusCode)"
Write-Host "Body: $($resp.Content.ReadAsStringAsync().Result)"
