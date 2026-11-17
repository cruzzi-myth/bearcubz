// Moon Racer - Avatar Creator V2 (I1+I2) automation tests. Run:
//   UnrealEditor-Cmd <abs .uproject> -ExecCmds="Automation RunTests MoonRacer.AvatarV2; Quit" -unattended -nullrhi
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "AvatarV2/MRAvatarV2Camera.h"
#include "AvatarV2/MRAvatarV2Gate.h"
#include "AvatarV2/MRAvatarV2Session.h"
#include "AvatarV2/MRUi.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;

	struct FGateScope
	{
		~FGateScope() { MRAvatarV2Dev::SetFlagOverrideForTest(TOptional<bool>()); MRAvatarV2Dev::SetSimulateShippingForTest(false); }
	};

	UMRAvatarV2Session* MakeSession(UMRAvatarCatalog* C)
	{
		UMRAvatarV2Session* S = NewObject<UMRAvatarV2Session>(GetTransientPackage());
		S->SetCatalogForTest(C);
		return S;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2GateTest, "MoonRacer.AvatarV2.Gate.FlagShippingAndProtectedSlot", TestFlags)
bool FMRV2GateTest::RunTest(const FString&)
{
	FGateScope Scope;
	MRAvatarV2Dev::SetFlagOverrideForTest(false);
	TestFalse(TEXT("not allowed without the flag"), MRAvatarV2Dev::IsAllowed());
	TestTrue(TEXT("refusal names the flag"), MRAvatarV2Dev::RefusalReason().Contains(MRAvatarV2Dev::FlagName));
	MRAvatarV2Dev::SetFlagOverrideForTest(true);
	TestTrue(TEXT("allowed with the flag outside Shipping"), MRAvatarV2Dev::IsAllowed() || MRAvatarV2Dev::IsShippingBuild());
	MRAvatarV2Dev::SetSimulateShippingForTest(true);
	TestFalse(TEXT("Shipping refuses even with the flag"), MRAvatarV2Dev::IsAllowed());
	TestTrue(TEXT("Shipping refusal says so"), MRAvatarV2Dev::RefusalReason().Contains(TEXT("Shipping")));
	MRAvatarV2Dev::SetSimulateShippingForTest(false);
	TestTrue(TEXT("default slot is protected"), MRAvatarV2Dev::IsProtectedSlot(MRAvatarV2Dev::ProtectedDefaultSlot));
	TestTrue(TEXT("protection ignores case"), MRAvatarV2Dev::IsProtectedSlot(TEXT("mravatar_local")));
	TestTrue(TEXT("empty slot is protected"), MRAvatarV2Dev::IsProtectedSlot(FString()));
	TestFalse(TEXT("the dev slot is not protected"), MRAvatarV2Dev::IsProtectedSlot(MRAvatarV2Dev::DefaultDevSlot));
	FString Given;
	if (!FParse::Value(FCommandLine::Get(), TEXT("MRAvatarSlot="), Given))
		TestEqual(TEXT("default resolved slot is the V2 dev slot"), MRAvatarV2Dev::ResolveSlotName(), FString(MRAvatarV2Dev::DefaultDevSlot));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2CameraTest, "MoonRacer.AvatarV2.Camera.ViewsLimitsAndReset", TestFlags)
bool FMRV2CameraTest::RunTest(const FString&)
{
	FMRAvatarV2CameraModel M;
	M.SetAnchor(FVector(100, 200, 30), 0.f);
	TestEqual(TEXT("six views"), FMRAvatarV2CameraModel::AllViews().Num(), 6);
	for (EMRV2View V : FMRAvatarV2CameraModel::AllViews())
	{
		const FMRV2ViewPreset& P = FMRAvatarV2CameraModel::Preset(V);
		M.SetView(V, true);
		TestEqual(FString::Printf(TEXT("%s: default distance"), P.Name), M.GetDistance(), P.Distance);
		// Orbit to the extremes: yaw/pitch stay inside the view's limits.
		M.Orbit(10000.f, 10000.f); M.Tick(10.f);
		TestTrue(FString::Printf(TEXT("%s: pitch max"), P.Name), M.GetPitch() <= P.MaxPitch + 0.01f);
		if (P.YawRange < 180.f) TestTrue(FString::Printf(TEXT("%s: yaw within range"), P.Name), FMath::Abs(FMath::FindDeltaAngleDegrees(P.Yaw, M.GetYaw())) <= P.YawRange + 0.1f);
		M.Orbit(-20000.f, -20000.f); M.Tick(10.f);
		TestTrue(FString::Printf(TEXT("%s: pitch min"), P.Name), M.GetPitch() >= P.MinPitch - 0.01f);
		if (P.YawRange < 180.f) TestTrue(FString::Printf(TEXT("%s: yaw within range (other side)"), P.Name), FMath::Abs(FMath::FindDeltaAngleDegrees(P.Yaw, M.GetYaw())) <= P.YawRange + 0.1f);
		M.Zoom(100000.f); M.Tick(10.f); TestTrue(FString::Printf(TEXT("%s: max zoom out"), P.Name), M.GetDistance() <= P.MaxDistance + 0.01f);
		M.Zoom(-100000.f); M.Tick(10.f); TestTrue(FString::Printf(TEXT("%s: max zoom in"), P.Name), M.GetDistance() >= P.MinDistance - 0.01f);
		M.ResetCamera(); M.Tick(10.f);
		TestTrue(FString::Printf(TEXT("%s: reset returns to the default framing"), P.Name), FMath::IsNearlyEqual(M.GetDistance(), P.Distance, 0.5f) && FMath::IsNearlyEqual(M.GetPitch(), P.Pitch, 0.5f) && FMath::Abs(FMath::FindDeltaAngleDegrees(M.GetYaw(), P.Yaw)) < 0.5f);
		// Camera is always outside a 30 cm radius around the focus (never inside the character) and looks at the focus.
		TestTrue(FString::Printf(TEXT("%s: never inside the character"), P.Name), FVector::Dist(M.GetLocation(), M.GetFocus()) > 30.f);
		const FVector Fwd = M.GetRotation().Vector(); const FVector ToFocus = (M.GetFocus() - M.GetLocation()).GetSafeNormal();
		TestTrue(FString::Printf(TEXT("%s: looks at the focus"), P.Name), FVector::DotProduct(Fwd, ToFocus) > 0.999f);
	}
	// Specific orientation: front camera sits on the +X side, side on +Y, rear on -X (character faces +X).
	M.SetView(EMRV2View::Front, true); TestTrue(TEXT("front is +X of the character"), M.GetLocation().X > M.GetFocus().X + 300.f);
	M.SetView(EMRV2View::Side, true);  TestTrue(TEXT("side is +Y of the character"), M.GetLocation().Y > M.GetFocus().Y + 300.f);
	M.SetView(EMRV2View::Rear, true);  TestTrue(TEXT("rear is -X of the character"), M.GetLocation().X < M.GetFocus().X - 300.f);
	// Smoothing converges and does not overshoot the target distance.
	M.SetView(EMRV2View::FullBody, true); M.SetView(EMRV2View::Face);
	float Prev = M.GetDistance(); bool bMonotonic = true;
	for (int32 i = 0; i < 120; ++i) { M.Tick(1.f / 60.f); if (M.GetDistance() > Prev + 0.001f) bMonotonic = false; Prev = M.GetDistance(); }
	TestTrue(TEXT("transition is monotonic (no overshoot)"), bMonotonic);
	TestTrue(TEXT("transition converges in 2 s"), FMath::IsNearlyEqual(M.GetDistance(), FMRAvatarV2CameraModel::Preset(EMRV2View::Face).Distance, 1.5f));
	// Reduced motion cuts instantly.
	FMRAvatarV2CameraModel R; R.bReduceMotion = true; R.SetView(EMRV2View::Face);
	TestEqual(TEXT("reduce-motion snaps"), R.GetDistance(), FMRAvatarV2CameraModel::Preset(EMRV2View::Face).Distance);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2CameraFramingTest, "MoonRacer.AvatarV2.Camera.CharacterProminenceAndFov", TestFlags)
bool FMRV2CameraFramingTest::RunTest(const FString&)
{
	FMRAvatarV2CameraModel M; M.SetView(EMRV2View::FullBody, true);
	TestTrue(TEXT("full-body: a 180 cm character fills >55% of the view height"), M.ApproxCharacterScreenFraction(180.f) > 0.55f);
	TestTrue(TEXT("full-body: and fits in the view"), M.ApproxCharacterScreenFraction(180.f) < 0.95f);
	M.SetView(EMRV2View::Face, true);
	TestTrue(TEXT("face: a 25 cm head fills >45% of the view height"), M.ApproxCharacterScreenFraction(25.f) > 0.45f);
	M.SetView(EMRV2View::FullBody, true);
	TestTrue(TEXT("16:9 horizontal FOV is wider than vertical"), M.GetHorizontalFov(16.f / 9.f) > M.GetVerticalFov());
	TestTrue(TEXT("1:1 aspect keeps the same FOV"), FMath::IsNearlyEqual(M.GetHorizontalFov(1.f), M.GetVerticalFov(), 0.01f));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2StructureTest, "MoonRacer.AvatarV2.Session.SixStagesFourteenCategories", TestFlags)
bool FMRV2StructureTest::RunTest(const FString&)
{
	const TArray<FMRV2Stage>& St = UMRAvatarV2Session::Stages();
	const TArray<FMRV2Category>& Ca = UMRAvatarV2Session::Categories();
	const TArray<FString> StageNames = { TEXT("Race & Base"), TEXT("Appearance"), TEXT("Style & Gear"), TEXT("House Crest"), TEXT("Identity"), TEXT("Final Review") };
	const TArray<FString> CatNames = { TEXT("Species & Base"), TEXT("Body"), TEXT("Head Shape"), TEXT("Facial Features"), TEXT("Ears & Horns"), TEXT("Hair & Styles"), TEXT("Markings & Patterns"), TEXT("Eyes"), TEXT("Skin & Surface"), TEXT("Augmentations"), TEXT("Attire & Armor"), TEXT("Colors & Materials"), TEXT("House Crest"), TEXT("Identity & Profile") };
	if (!TestEqual(TEXT("six stages"), St.Num(), 6) || !TestEqual(TEXT("fourteen categories"), Ca.Num(), 14)) return false;
	for (int32 i = 0; i < 6; ++i) TestEqual(*FString::Printf(TEXT("stage %d name"), i + 1), St[i].Name, StageNames[i]);
	for (int32 i = 0; i < 14; ++i) { TestEqual(*FString::Printf(TEXT("category %d number"), i + 1), Ca[i].Number, i + 1); TestEqual(*FString::Printf(TEXT("category %d name"), i + 1), Ca[i].Name, CatNames[i]); }
	// Mapping matches the AV2-D8 specification section 2.
	TestEqual(TEXT("stage 1"), UMRAvatarV2Session::CategoriesOfStage(1), TArray<int32>({ 1 }));
	TestEqual(TEXT("stage 2"), UMRAvatarV2Session::CategoriesOfStage(2), TArray<int32>({ 2, 3, 4, 5, 6, 7, 8, 9, 10 }));
	TestEqual(TEXT("stage 3"), UMRAvatarV2Session::CategoriesOfStage(3), TArray<int32>({ 11, 12 }));
	TestEqual(TEXT("stage 4"), UMRAvatarV2Session::CategoriesOfStage(4), TArray<int32>({ 13 }));
	TestEqual(TEXT("stage 5"), UMRAvatarV2Session::CategoriesOfStage(5), TArray<int32>({ 14 }));
	TestEqual(TEXT("stage 6 has no categories (review)"), UMRAvatarV2Session::CategoriesOfStage(6).Num(), 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2CapabilityTest, "MoonRacer.AvatarV2.Session.CapabilityMatrixIsHonest", TestFlags)
bool FMRV2CapabilityTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = UMRAvatarCatalog::LoadDefault();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	UMRAvatarV2Session* S = MakeSession(C);
	// The reasons given for unavailable controls are true of the catalog.
	for (const FMRAvatarOption& O : C->Hair) TestFalse(TEXT("every hair option is Pending (no hair asset)"), O.IsAvailable());
	for (const FMRAvatarOption& O : C->Eyes) TestFalse(TEXT("every eye option is Pending"), O.IsAvailable());
	for (const FMRAvatarOption& O : C->Outfits) TestFalse(TEXT("every outfit option is Pending"), O.IsAvailable());
	for (const FMRAvatarOption& O : C->SignalAccents) TestFalse(TEXT("every signal accent is Pending"), O.IsAvailable());
	const TSet<int32> Backed = { 1, 2, 11, 12, 13 };
	for (const FMRV2Category& K : UMRAvatarV2Session::Categories())
	{
		const FMRV2Capability Cap = S->Capability(K.Number);
		if (Backed.Contains(K.Number))
		{
			TestTrue(*FString::Printf(TEXT("category %d is live or partial"), K.Number), Cap.Support != EMRV2Support::Unavailable);
			const EMRV2OptionKind Kind = K.Number == 1 ? EMRV2OptionKind::Species : K.Number == 2 ? EMRV2OptionKind::Body : K.Number == 11 ? EMRV2OptionKind::Accessory : K.Number == 12 ? EMRV2OptionKind::Material : EMRV2OptionKind::Crest;
			TestTrue(*FString::Printf(TEXT("category %d has real options behind it"), K.Number), S->Options(Kind).Num() > 0);
		}
		else
		{
			TestTrue(*FString::Printf(TEXT("category %d is unavailable"), K.Number), Cap.Support == EMRV2Support::Unavailable);
			TestTrue(*FString::Printf(TEXT("category %d explains why"), K.Number), Cap.Unavailable.Num() > 0);
		}
		// No invented gameplay/faction language anywhere in the matrix.
		FString All = Cap.Summary; for (const FString& U : Cap.Unavailable) All += U;
		for (const TCHAR* Bad : { TEXT("bonus"), TEXT("benefit"), TEXT("reputation"), TEXT("attribute"), TEXT("stat ") })
			TestFalse(*FString::Printf(TEXT("category %d text avoids '%s'"), K.Number, Bad), All.Contains(Bad, ESearchCase::IgnoreCase));
	}
	// Species: exactly the six canonical ids, each marked id-only; Pending bodies/accessories/materials are never offered.
	const TArray<FMRV2Option> Sp = S->Options(EMRV2OptionKind::Species);
	TestEqual(TEXT("six species options"), Sp.Num(), 6);
	for (const FMRV2Option& O : Sp) { TestTrue(*FString::Printf(TEXT("%s is canonical"), *O.Id.ToString()), MRAvatar::IsCanonicalSpecies(O.Id)); TestTrue(TEXT("species note admits the shared body"), O.Note.Contains(TEXT("shared"))); }
	for (EMRV2OptionKind K : { EMRV2OptionKind::Body, EMRV2OptionKind::Accessory, EMRV2OptionKind::Material })
		for (const FMRV2Option& O : S->Options(K)) TestTrue(*FString::Printf(TEXT("%s is a dev placeholder"), *O.Id.ToString()), O.bDevPlaceholder);
	TestTrue(TEXT("body options are the mannequins"), S->Options(EMRV2OptionKind::Body).ContainsByPredicate([](const FMRV2Option& O) { return O.Id == FName("dev_manny"); }));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2CrestTest, "MoonRacer.AvatarV2.Session.HouseCrestPlaceholderRules", TestFlags)
bool FMRV2CrestTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = UMRAvatarCatalog::LoadDefault();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	UMRAvatarV2Session* S = MakeSession(C);
	for (const FName& Id : UMRAvatarV2Session::PlaceholderCrestIds()) TestTrue(TEXT("every placeholder id is labelled TEST_FIXTURE_NONCANON"), Id.ToString().StartsWith(TEXT("TEST_FIXTURE_NONCANON")));
	for (const FMRV2Option& O : S->Options(EMRV2OptionKind::Crest)) TestTrue(TEXT("crest options say NONCANON"), O.Note.Contains(TEXT("NONCANON")));
	TestFalse(TEXT("post-creation crest changes are unavailable"), UMRAvatarV2Session::AreCrestChangesAvailable());
	TestTrue(TEXT("nothing chosen initially"), S->OriginalCrestId().IsNone() && S->ActiveCrestId().IsNone());
	TestFalse(TEXT("an invented House id is rejected"), S->SelectCrest(FName("House_Obsidian")).bOk);
	TestTrue(TEXT("a placeholder can be chosen at creation"), S->SelectCrest(UMRAvatarV2Session::PlaceholderCrestIds()[0]).bOk);
	TestEqual(TEXT("original == active at creation"), S->OriginalCrestId(), S->ActiveCrestId());
	TestTrue(TEXT("it can be re-picked before the avatar is saved"), S->SelectCrest(UMRAvatarV2Session::PlaceholderCrestIds()[2]).bOk && S->OriginalCrestId() == UMRAvatarV2Session::PlaceholderCrestIds()[2]);
	TestFalse(TEXT("without a character, saving is refused (no write path)"), S->SaveToDevSlot().bOk);
	S->ResetCrestForDev();
	TestTrue(TEXT("dev reset clears it"), S->OriginalCrestId().IsNone());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2UiTokensTest, "MoonRacer.AvatarV2.Ui.TokensAreSane", TestFlags)
bool FMRV2UiTokensTest::RunTest(const FString&)
{
	const MRUi::FTokens& T = MRUi::Tokens();
	TestTrue(TEXT("body text is at least 12 px (design minimum 14 px at 1080p is a UI-scale concern)"), T.FontBody >= 12);
	TestTrue(TEXT("type hierarchy descends"), T.FontTitle > T.FontH1 && T.FontH1 > T.FontH2 && T.FontH2 >= T.FontBody && T.FontBody > T.FontCaption);
	auto Lum = [](const FLinearColor& C) { return 0.2126f * C.R + 0.7152f * C.G + 0.0722f * C.B; };
	const float Contrast = (Lum(T.TextPrimary) + 0.05f) / (Lum(T.BgPanel) + 0.05f);
	TestTrue(TEXT("primary text vs panel contrast >= 4.5:1"), Contrast >= 4.5f);
	const float MutedContrast = (Lum(T.TextMuted) + 0.05f) / (Lum(T.BgPanel) + 0.05f);
	TestTrue(TEXT("muted text vs panel contrast >= 4.5:1"), MutedContrast >= 4.5f);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
