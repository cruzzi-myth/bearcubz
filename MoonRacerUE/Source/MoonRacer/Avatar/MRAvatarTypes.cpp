#include "Avatar/MRAvatarTypes.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace MRAvatar
{
	const TArray<FName>& CanonicalSpeciesIds()
	{
		static const TArray<FName> Ids = { FName(TEXT("human")), FName(TEXT("hybrid")), FName(TEXT("ai")), FName(TEXT("alien")), FName(TEXT("mythraxian")), FName(TEXT("glitch")) };
		return Ids;
	}

	bool IsCanonicalSpecies(FName SpeciesId)
	{
		return CanonicalSpeciesIds().Contains(SpeciesId);
	}
}

bool FMRAvatarValidationResult::IsValid() const
{
	return CountSeverity(EMRAvatarIssueSeverity::Error) == 0;
}

bool FMRAvatarValidationResult::HasPending() const
{
	return CountSeverity(EMRAvatarIssueSeverity::Pending) > 0;
}

int32 FMRAvatarValidationResult::CountSeverity(EMRAvatarIssueSeverity Severity) const
{
	int32 N = 0;
	for (const FMRAvatarIssue& I : Issues) { if (I.Severity == Severity) ++N; }
	return N;
}

void FMRAvatarValidationResult::Add(EMRAvatarSlot Slot, EMRAvatarIssueSeverity Severity, FName Id, const FString& Message)
{
	FMRAvatarIssue Issue;
	Issue.Slot = Slot; Issue.Severity = Severity; Issue.Id = Id; Issue.Message = Message;
	Issues.Add(MoveTemp(Issue));
}

FString FMRAvatarValidationResult::ToString() const
{
	FString Out;
	for (const FMRAvatarIssue& I : Issues)
	{
		const TCHAR* Sev = I.Severity == EMRAvatarIssueSeverity::Error ? TEXT("ERROR") : I.Severity == EMRAvatarIssueSeverity::Pending ? TEXT("PENDING") : TEXT("INFO");
		Out += FString::Printf(TEXT("[%s] %s: %s; "), Sev, *I.Id.ToString(), *I.Message);
	}
	return Out.IsEmpty() ? TEXT("ok") : Out;
}

bool FMRAvatarAppearance::operator==(const FMRAvatarAppearance& O) const
{
	return SchemaVersion == O.SchemaVersion && AvatarId == O.AvatarId && SpeciesId == O.SpeciesId && BodyBaseId == O.BodyBaseId
		&& HairId == O.HairId && EyesId == O.EyesId && OutfitId == O.OutfitId && AccessoryIds == O.AccessoryIds
		&& SignalAccentId == O.SignalAccentId && MaterialVariantId == O.MaterialVariantId && Revision == O.Revision;
}

FString FMRAvatarAppearance::ToJsonString() const
{
	TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
	O->SetNumberField(TEXT("schemaVersion"), SchemaVersion);
	O->SetStringField(TEXT("avatarId"), AvatarId.ToString(EGuidFormats::DigitsWithHyphens));
	O->SetStringField(TEXT("speciesId"), SpeciesId.ToString());
	O->SetStringField(TEXT("bodyBaseId"), BodyBaseId.ToString());
	O->SetStringField(TEXT("hairId"), HairId.ToString());
	O->SetStringField(TEXT("eyesId"), EyesId.ToString());
	O->SetStringField(TEXT("outfitId"), OutfitId.ToString());
	TArray<TSharedPtr<FJsonValue>> Acc;
	for (const FName& A : AccessoryIds) { Acc.Add(MakeShared<FJsonValueString>(A.ToString())); }
	O->SetArrayField(TEXT("accessoryIds"), Acc);
	O->SetStringField(TEXT("signalAccentId"), SignalAccentId.ToString());
	O->SetStringField(TEXT("materialVariantId"), MaterialVariantId.ToString());
	O->SetNumberField(TEXT("revision"), Revision);
	FString Out;
	TSharedRef<TJsonWriter<>> W = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(O, W);
	return Out;
}

namespace
{
	// UE's TryGet*Field coerce between JSON types (e.g. number -> string), so type checks are done explicitly.
	bool IsType(const TSharedPtr<FJsonObject>& O, const TCHAR* Field, EJson Type)
	{
		const TSharedPtr<FJsonValue>* V = O->Values.Find(Field);
		return V && V->IsValid() && (*V)->Type == Type;
	}

	// Optional string field: absent -> unchanged; present but not a string -> error.
	bool ReadOptionalName(const TSharedPtr<FJsonObject>& O, const TCHAR* Field, FName& Out, FString& Error)
	{
		if (!O->HasField(Field)) return true;
		FString S;
		if (!IsType(O, Field, EJson::String) || !O->TryGetStringField(Field, S)) { Error = FString::Printf(TEXT("field '%s' must be a string"), Field); return false; }
		Out = S.IsEmpty() ? NAME_None : FName(*S);
		return true;
	}
}

bool FMRAvatarAppearance::FromJsonString(const FString& Json, FMRAvatarAppearance& Out, FString& Error)
{
	TSharedPtr<FJsonObject> O;
	TSharedRef<TJsonReader<>> R = TJsonReaderFactory<>::Create(Json);
	if (!FJsonSerializer::Deserialize(R, O) || !O.IsValid())
	{
		Error = TEXT("malformed JSON");
		return false;
	}
	double Ver = 0;
	if (!IsType(O, TEXT("schemaVersion"), EJson::Number) || !O->TryGetNumberField(TEXT("schemaVersion"), Ver)) { Error = TEXT("missing or non-numeric 'schemaVersion'"); return false; }
	FString SpeciesStr;
	if (!IsType(O, TEXT("speciesId"), EJson::String) || !O->TryGetStringField(TEXT("speciesId"), SpeciesStr)) { Error = TEXT("missing or non-string 'speciesId'"); return false; }

	// FName is case-insensitive, so canonical-ID casing can only be enforced on the raw string: IDs are lowercase.
	if (!SpeciesStr.Equals(SpeciesStr.ToLower(), ESearchCase::CaseSensitive)) { Error = TEXT("species IDs must be lowercase (canonical form)"); return false; }

	FMRAvatarAppearance Tmp;
	Tmp.SchemaVersion = (int32)Ver;
	Tmp.SpeciesId = FName(*SpeciesStr);
	FString IdStr;
	if (O->TryGetStringField(TEXT("avatarId"), IdStr) && !IdStr.IsEmpty() && !FGuid::Parse(IdStr, Tmp.AvatarId)) { Error = TEXT("invalid 'avatarId'"); return false; }
	if (!ReadOptionalName(O, TEXT("bodyBaseId"), Tmp.BodyBaseId, Error)) return false;
	if (!ReadOptionalName(O, TEXT("hairId"), Tmp.HairId, Error)) return false;
	if (!ReadOptionalName(O, TEXT("eyesId"), Tmp.EyesId, Error)) return false;
	if (!ReadOptionalName(O, TEXT("outfitId"), Tmp.OutfitId, Error)) return false;
	if (!ReadOptionalName(O, TEXT("signalAccentId"), Tmp.SignalAccentId, Error)) return false;
	if (!ReadOptionalName(O, TEXT("materialVariantId"), Tmp.MaterialVariantId, Error)) return false;
	if (O->HasField(TEXT("accessoryIds")))
	{
		const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
		if (!IsType(O, TEXT("accessoryIds"), EJson::Array) || !O->TryGetArrayField(TEXT("accessoryIds"), Arr)) { Error = TEXT("'accessoryIds' must be an array"); return false; }
		for (const TSharedPtr<FJsonValue>& V : *Arr)
		{
			FString S;
			if (!V.IsValid() || V->Type != EJson::String || !V->TryGetString(S)) { Error = TEXT("'accessoryIds' must contain only strings"); return false; }
			Tmp.AccessoryIds.Add(FName(*S));
		}
	}
	double Rev = 1;
	if (O->HasField(TEXT("revision")) && (!IsType(O, TEXT("revision"), EJson::Number) || !O->TryGetNumberField(TEXT("revision"), Rev))) { Error = TEXT("'revision' must be numeric"); return false; }
	Tmp.Revision = (int32)Rev;
	Out = Tmp;
	return true;
}
