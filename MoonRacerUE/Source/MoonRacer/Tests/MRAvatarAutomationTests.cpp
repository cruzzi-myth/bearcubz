// Moon Racer - avatar data/persistence automation tests (Phase 3A). Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.Avatar; Quit" -unattended -nullrhi
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Avatar/MRAvatarTypes.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Engine/GameInstance.h"
#include "Kismet/GameplayStatics.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	const TCHAR* TestSlot = TEXT("MRAvatar_AutomationTest");

	UMRAvatarCatalog* RealCatalog() { return UMRAvatarCatalog::LoadDefault(); }

	FMRAvatarAppearance Good(UMRAvatarCatalog* C)
	{
		FMRAvatarAppearance A = C->MakeDefaultAppearance();
		A.AccessoryIds = { FName("dev_marker_head_top"), FName("dev_marker_hand_r_grip") };
		A.MaterialVariantId = FName("dev_alt");
		return A;
	}

	UMRAvatarSaveSubsystem* MakeSubsystem(UMRAvatarCatalog* C)
	{
		UMRAvatarSaveSubsystem::SetSlotNameOverride(TestSlot);
		UGameInstance* GI = NewObject<UGameInstance>(GetTransientPackage()); // the subsystem's required outer
		UMRAvatarSaveSubsystem* S = NewObject<UMRAvatarSaveSubsystem>(GI);
		S->SetCatalogOverride(C);
		S->DeleteSavedAppearance();
		return S;
	}

	bool HasError(const FMRAvatarValidationResult& R, EMRAvatarSlot Slot)
	{
		return R.Issues.ContainsByPredicate([Slot](const FMRAvatarIssue& I) { return I.Slot == Slot && I.Severity == EMRAvatarIssueSeverity::Error; });
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarSpeciesTest, "MoonRacer.Avatar.Species.SixCanonicalIdsPreserved", TestFlags)
bool FMRAvatarSpeciesTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog asset loads"), C)) return false;
	const TArray<FName> Expected = { FName("human"), FName("hybrid"), FName("ai"), FName("alien"), FName("mythraxian"), FName("glitch") };
	TestEqual(TEXT("canonical list has the six permanent IDs"), MRAvatar::CanonicalSpeciesIds(), Expected);
	TestEqual(TEXT("catalog lists exactly six species"), C->Species.Num(), 6);
	for (const FName& Id : Expected)
	{
		const FMRSpeciesEntry* S = C->FindSpecies(Id);
		TestNotNull(*FString::Printf(TEXT("catalog contains %s"), *Id.ToString()), S);
		if (S) TestTrue(*FString::Printf(TEXT("%s is Unassessed (no 3D model exists)"), *Id.ToString()), S->Assessment == EMRSpeciesAssessment::Unassessed);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarCatalogContentTest, "MoonRacer.Avatar.Catalog.CanonicalIdsPendingAndDevMarked", TestFlags)
bool FMRAvatarCatalogContentTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	for (const FName& Id : { FName("signal-crop"), FName("drift-waves"), FName("void-braid"), FName("static-shave") })
	{
		const FMRAvatarOption* O = UMRAvatarCatalog::FindIn(C->Hair, Id);
		TestNotNull(*FString::Printf(TEXT("canonical hair %s present"), *Id.ToString()), O);
		if (O) TestTrue(TEXT("canonical hair is Pending (no 3D asset)"), O->Status == EMRAvatarAssetStatus::Pending);
	}
	TestEqual(TEXT("4 canonical eyes"), C->Eyes.Num(), 4);
	TestEqual(TEXT("4 canonical outfits"), C->Outfits.Num(), 4);
	TestEqual(TEXT("4 canonical signal accents"), C->SignalAccents.Num(), 4);
	for (const FMRAvatarOption& B : C->Bodies)
		TestTrue(*FString::Printf(TEXT("body %s is flagged as dev placeholder"), *B.Id.ToString()), B.Status == EMRAvatarAssetStatus::DevPlaceholder && B.Id.ToString().StartsWith(TEXT("dev_")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarValidAppearanceTest, "MoonRacer.Avatar.Validation.AcceptsValid", TestFlags)
bool FMRAvatarValidAppearanceTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	const FMRAvatarValidationResult D = C->Validate(C->MakeDefaultAppearance());
	TestTrue(TEXT("default appearance valid"), D.IsValid());
	for (const FName& Species : MRAvatar::CanonicalSpeciesIds())
	{
		FMRAvatarAppearance A = Good(C); A.SpeciesId = Species;
		TestTrue(*FString::Printf(TEXT("species %s valid with dev body"), *Species.ToString()), C->Validate(A).IsValid());
	}
	FMRAvatarAppearance Pending = Good(C); Pending.HairId = FName("signal-crop");
	const FMRAvatarValidationResult P = C->Validate(Pending);
	TestTrue(TEXT("pending canonical hair is allowed"), P.IsValid());
	TestTrue(TEXT("but flagged Pending"), P.HasPending());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarRejectInvalidTest, "MoonRacer.Avatar.Validation.RejectsUnknownIdsAndBadCombinations", TestFlags)
bool FMRAvatarRejectInvalidTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	auto Expect = [&](const TCHAR* What, FMRAvatarAppearance A, EMRAvatarSlot Slot) { TestTrue(What, HasError(C->Validate(A), Slot)); };

	FMRAvatarAppearance A = Good(C); A.SpeciesId = FName("elf"); Expect(TEXT("unknown species rejected"), A, EMRAvatarSlot::Species);
	// FName is case-insensitive: FName("Human") == FName("human"). Casing is enforced at the JSON string level (see Json test).
	A = Good(C); A.SpeciesId = FName("Human"); TestTrue(TEXT("FName is case-insensitive, so Human == human and validates"), C->Validate(A).IsValid());
	A = Good(C); A.SpeciesId = FName("human "); Expect(TEXT("species with stray whitespace rejected"), A, EMRAvatarSlot::Species);
	A = Good(C); A.BodyBaseId = NAME_None; Expect(TEXT("missing body rejected"), A, EMRAvatarSlot::BodyBase);
	A = Good(C); A.BodyBaseId = FName("bogus_body"); Expect(TEXT("unknown body rejected"), A, EMRAvatarSlot::BodyBase);
	A = Good(C); A.HairId = FName("nonexistent-hair"); Expect(TEXT("unknown hair rejected"), A, EMRAvatarSlot::Hair);
	A = Good(C); A.EyesId = FName("laser-eyes"); Expect(TEXT("unknown eyes rejected"), A, EMRAvatarSlot::Eyes);
	A = Good(C); A.OutfitId = FName("space-suit"); Expect(TEXT("unknown outfit rejected"), A, EMRAvatarSlot::Outfit);
	A = Good(C); A.SignalAccentId = FName("rainbow"); Expect(TEXT("unknown signal accent rejected"), A, EMRAvatarSlot::SignalAccent);
	A = Good(C); A.AccessoryIds.Add(FName("jetpack")); Expect(TEXT("unknown accessory rejected"), A, EMRAvatarSlot::Accessory);
	A = Good(C); A.AccessoryIds = { FName("dev_marker_head_top"), FName("dev_marker_head_top") }; Expect(TEXT("duplicate accessory rejected"), A, EMRAvatarSlot::Accessory);
	A = Good(C); A.MaterialVariantId = FName("neon_flames"); Expect(TEXT("unknown material variant rejected"), A, EMRAvatarSlot::MaterialVariant);
	A = Good(C); A.SchemaVersion = MRAvatar::CurrentSchemaVersion + 1; Expect(TEXT("newer schema rejected"), A, EMRAvatarSlot::Schema);
	A = Good(C); A.SchemaVersion = 0; Expect(TEXT("un-migrated schema rejected"), A, EMRAvatarSlot::Schema);

	// Invalid combination: two accessories claiming the same attachment point.
	UMRAvatarCatalog* Synth = DuplicateObject<UMRAvatarCatalog>(C, GetTransientPackage());
	if (FMRAvatarOption* Second = Synth->Accessories.FindByPredicate([](const FMRAvatarOption& O) { return O.Id == FName("dev_marker_head_face"); }))
	{
		Second->AttachmentPointId = FName("MR_Head_Top");
		A = Good(Synth); A.AccessoryIds = { FName("dev_marker_head_top"), FName("dev_marker_head_face") };
		TestTrue(TEXT("two accessories on one attachment point rejected"), HasError(Synth->Validate(A), EMRAvatarSlot::Accessory));
	}
	else AddError(TEXT("synthetic catalog missing dev_marker_head_face"));

	// Invalid combination: a material variant that has no binding for the chosen body.
	if (FMRAvatarOption* Alt = Synth->MaterialVariants.FindByPredicate([](const FMRAvatarOption& O) { return O.Id == FName("dev_alt"); }))
	{
		Alt->MaterialBindings.RemoveAll([](const FMRMaterialBinding& B) { return B.BodyId == FName("dev_quinn"); });
		A = Good(Synth); A.BodyBaseId = FName("dev_quinn");
		TestTrue(TEXT("material variant unsupported on body rejected"), HasError(Synth->Validate(A), EMRAvatarSlot::MaterialVariant));
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarJsonTest, "MoonRacer.Avatar.Json.RoundTripAndMalformed", TestFlags)
bool FMRAvatarJsonTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	FMRAvatarAppearance A = Good(C); A.HairId = FName("void-braid"); A.Revision = 7;
	FMRAvatarAppearance B; FString Err;
	TestTrue(TEXT("round trip parses"), FMRAvatarAppearance::FromJsonString(A.ToJsonString(), B, Err));
	TestTrue(TEXT("round trip equal"), A == B);

	for (const TCHAR* Bad : { TEXT(""), TEXT("not json"), TEXT("{"), TEXT("[]"), TEXT("{}"), TEXT("{\"schemaVersion\":\"one\",\"speciesId\":\"human\"}"),
		TEXT("{\"schemaVersion\":1}"), TEXT("{\"schemaVersion\":1,\"speciesId\":5}"), TEXT("{\"schemaVersion\":1,\"speciesId\":\"human\",\"accessoryIds\":[1,2]}"),
		TEXT("{\"schemaVersion\":1,\"speciesId\":\"human\",\"accessoryIds\":\"x\"}"), TEXT("{\"schemaVersion\":1,\"speciesId\":\"human\",\"bodyBaseId\":42}"), TEXT("{\"schemaVersion\":\"1\",\"speciesId\":\"human\"}"), TEXT("{\"schemaVersion\":1,\"speciesId\":\"Human\"}") })
	{
		FMRAvatarAppearance Out; FString E;
		TestFalse(*FString::Printf(TEXT("malformed JSON rejected: %s"), Bad), FMRAvatarAppearance::FromJsonString(Bad, Out, E));
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarSaveRoundTripTest, "MoonRacer.Avatar.Persistence.SaveLoadRoundTrip", TestFlags)
bool FMRAvatarSaveRoundTripTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	UMRAvatarSaveSubsystem* S = MakeSubsystem(C);

	FMRAvatarLoadReport R;
	const FMRAvatarAppearance None = S->LoadAppearance(R);
	TestFalse(TEXT("no save -> not found"), R.bFoundSave);
	TestTrue(TEXT("no save -> valid default"), C->Validate(None).IsValid());

	FMRAvatarAppearance A = Good(C); A.SpeciesId = FName("mythraxian"); A.BodyBaseId = FName("dev_quinn"); A.Revision = 3;
	FString Err;
	TestTrue(TEXT("save valid"), S->SaveAppearance(A, Err));
	TestTrue(TEXT("exists after save"), S->HasSavedAppearance());
	const FMRAvatarAppearance L = S->LoadAppearance(R);
	TestTrue(TEXT("found"), R.bFoundSave);
	TestFalse(TEXT("no migration needed"), R.bMigrated);
	TestTrue(TEXT("loaded equals saved"), L == A);

	FMRAvatarAppearance Bad = A; Bad.BodyBaseId = FName("bogus");
	TestFalse(TEXT("invalid save rejected"), S->SaveAppearance(Bad, Err));
	TestTrue(TEXT("existing save untouched by rejected save"), S->LoadAppearance(R) == A);

	S->DeleteSavedAppearance();
	TestFalse(TEXT("deleted"), S->HasSavedAppearance());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarMigrationTest, "MoonRacer.Avatar.Persistence.SaveVersionMigration", TestFlags)
bool FMRAvatarMigrationTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	UMRAvatarSaveSubsystem* S = MakeSubsystem(C);

	// v0 legacy save: capitalised single species + one accessory.
	UMRAvatarSaveGame* Old = NewObject<UMRAvatarSaveGame>(GetTransientPackage());
	Old->SaveVersion = 0; Old->LegacySpecies = FName("Human"); Old->LegacyAccessory = FName("dev_marker_head_top");
	TestTrue(TEXT("write v0 save"), UGameplayStatics::SaveGameToSlot(Old, UMRAvatarSaveSubsystem::GetSlotName(), 0));
	FMRAvatarLoadReport R;
	FMRAvatarAppearance A = S->LoadAppearance(R);
	TestTrue(TEXT("v0 migrated"), R.bMigrated);
	TestEqual(TEXT("migrated from version"), R.FromVersion, 0);
	TestEqual(TEXT("species lower-cased"), A.SpeciesId, FName("human"));
	TestTrue(TEXT("accessory carried"), A.AccessoryIds.Contains(FName("dev_marker_head_top")));
	TestEqual(TEXT("schema is current"), A.SchemaVersion, MRAvatar::CurrentSchemaVersion);
	TestTrue(TEXT("migrated result is valid"), C->Validate(A).IsValid());

	// Newer-than-supported save: ignored, default used, no crash.
	UMRAvatarSaveGame* Future = NewObject<UMRAvatarSaveGame>(GetTransientPackage());
	Future->SaveVersion = 99; Future->Appearance = Good(C);
	UGameplayStatics::SaveGameToSlot(Future, UMRAvatarSaveSubsystem::GetSlotName(), 0);
	A = S->LoadAppearance(R);
	TestTrue(TEXT("future save rejected"), R.bRejectedNewerVersion);
	TestTrue(TEXT("falls back to a valid default"), C->Validate(A).IsValid());
	S->DeleteSavedAppearance();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarObsoleteAssetsTest, "MoonRacer.Avatar.Persistence.ObsoleteAndMissingAssetsHandledSafely", TestFlags)
bool FMRAvatarObsoleteAssetsTest::RunTest(const FString&)
{
	UMRAvatarCatalog* C = RealCatalog();
	if (!TestNotNull(TEXT("catalog"), C)) return false;
	UMRAvatarSaveSubsystem* S = MakeSubsystem(C);

	// A save written by an older catalog that referenced options that no longer exist.
	UMRAvatarSaveGame* Save = NewObject<UMRAvatarSaveGame>(GetTransientPackage());
	Save->SaveVersion = MRAvatarSave::CurrentSaveVersion;
	FMRAvatarAppearance A = Good(C);
	A.BodyBaseId = FName("retired_body"); A.HairId = FName("retired-hair"); A.OutfitId = FName("retired-outfit");
	A.AccessoryIds = { FName("retired_accessory"), FName("dev_marker_chest") }; A.MaterialVariantId = FName("retired_variant");
	A.SpeciesId = FName("retired_species");
	Save->Appearance = A;
	UGameplayStatics::SaveGameToSlot(Save, UMRAvatarSaveSubsystem::GetSlotName(), 0);

	FMRAvatarLoadReport R;
	const FMRAvatarAppearance L = S->LoadAppearance(R);
	TestTrue(TEXT("sanitised"), R.bSanitized);
	TestTrue(TEXT("result is valid"), C->Validate(L).IsValid());
	TestEqual(TEXT("obsolete body -> default"), L.BodyBaseId, C->DefaultBodyId);
	TestEqual(TEXT("obsolete species -> default"), L.SpeciesId, C->DefaultSpeciesId);
	TestEqual(TEXT("obsolete hair cleared"), L.HairId, FName(NAME_None));
	TestEqual(TEXT("obsolete variant -> default"), L.MaterialVariantId, C->DefaultMaterialVariantId);
	TestFalse(TEXT("obsolete accessory removed"), L.AccessoryIds.Contains(FName("retired_accessory")));
	TestTrue(TEXT("still-valid accessory kept"), L.AccessoryIds.Contains(FName("dev_marker_chest")));
	TestTrue(TEXT("notes explain the changes"), R.Notes.Num() >= 5);
	S->DeleteSavedAppearance();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRAvatarLocalOnlyTest, "MoonRacer.Avatar.Persistence.LocalOnlyNoPassportFields", TestFlags)
bool FMRAvatarLocalOnlyTest::RunTest(const FString&)
{
	// The appearance JSON must carry no account/Passport/credential fields.
	FMRAvatarAppearance A; A.SpeciesId = FName("human");
	const FString Json = A.ToJsonString().ToLower();
	for (const TCHAR* Forbidden : { TEXT("passport"), TEXT("supabase"), TEXT("token"), TEXT("password"), TEXT("email"), TEXT("userid"), TEXT("secret") })
		TestFalse(*FString::Printf(TEXT("appearance JSON has no '%s'"), Forbidden), Json.Contains(Forbidden));
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
