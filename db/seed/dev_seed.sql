-- =========================================================================
-- Savismartboard — Local dev seed (optional)
-- =========================================================================

IF NOT EXISTS (SELECT 1 FROM dbo.SmartboardSchoolSetting WHERE SchoolId = 1)
BEGIN
    INSERT INTO dbo.SmartboardSchoolSetting (SchoolId, IsSmartboardEnabled, IsAiEnabled, AllowExport, AllowStudentSharing, IsAiSharingAllowed, AiMonthlyBudgetUsd)
    VALUES (1, 1, 1, 1, 1, 0, 50.00);
END
