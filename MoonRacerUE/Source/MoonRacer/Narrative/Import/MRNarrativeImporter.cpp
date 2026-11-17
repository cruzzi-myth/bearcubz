#include "Narrative/Import/MRNarrativeImporter.h"
#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Policies/PrettyJsonPrintPolicy.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "UObject/UObjectGlobals.h"
#include "MoonRacer.h"

int32 FMRNarrativeImporter::GFailAfterAssets = -1;

namespace
{
	using FJ = TSharedPtr<FJsonObject>;
	using FV = TSharedPtr<FJsonValue>;
	constexpr int32 SchemaVersion = 1;

	// ---- canonical text (sorted keys, no whitespace) for hashing ------------------------------------------------
	FString Canon(const FV& V)
	{
		if (!V.IsValid()) return TEXT("null");
		switch (V->Type)
		{
		case EJson::String: return TEXT("\"") + V->AsString().ReplaceCharWithEscapedChar() + TEXT("\"");
		case EJson::Number: return FString::SanitizeFloat(V->AsNumber());
		case EJson::Boolean: return V->AsBool() ? TEXT("true") : TEXT("false");
		case EJson::Array: { FString S = TEXT("["); for (const FV& E : V->AsArray()) S += Canon(E) + TEXT(","); return S + TEXT("]"); }
		case EJson::Object:
		{
			TArray<TPair<FString, FV>> Items; for (const auto& P : V->AsObject()->Values) Items.Add(TPair<FString, FV>(FString(*P.Key), P.Value));
			Items.Sort([](const TPair<FString, FV>& L, const TPair<FString, FV>& R) { return L.Key < R.Key; });
			FString S = TEXT("{"); for (const TPair<FString, FV>& P : Items) S += TEXT("\"") + P.Key + TEXT("\":") + Canon(P.Value) + TEXT(",");
			return S + TEXT("}");
		}
		default: return TEXT("null");
		}
	}
	FString Canon(const FJ& O) { return Canon(MakeShared<FJsonValueObject>(O)); }
	FString HashText(const FString& S) { FTCHARToUTF8 U(*S); return FSHA1::HashBuffer(U.Get(), U.Length()).ToString(); }

	// ---- strict object reader -----------------------------------------------------------------------------------
	struct FSrc
	{
		FJ O; FString Where; FMRValidationReport* R = nullptr; TSet<FString> Seen;
		void Err(const TCHAR* Code, const FString& M) const { R->Error(Code, FName(*Where), M); }
		const FJsonValue* Get(const TCHAR* K) { Seen.Add(K); const FV* V = O->Values.Find(K); return V ? V->Get() : nullptr; }
		FString Str(const TCHAR* K, bool bReq)
		{
			const FJsonValue* V = Get(K);
			if (!V) { if (bReq) Err(TEXT("SCHEMA_MISSING_FIELD"), FString::Printf(TEXT("required field '%s' is missing"), K)); return FString(); }
			if (V->Type != EJson::String) { Err(TEXT("SCHEMA_TYPE"), FString::Printf(TEXT("field '%s' must be a string"), K)); return FString(); }
			return V->AsString();
		}
		FName Id(const TCHAR* K, bool bReq)
		{
			const FString S = Str(K, bReq);
			if (S.IsEmpty()) { if (bReq && O->Values.Contains(K)) Err(TEXT("INVALID_ID"), FString::Printf(TEXT("'%s' must not be empty"), K)); return NAME_None; }
			if (!FMRNarrativeImporter::IsValidId(S)) { Err(TEXT("INVALID_ID"), FString::Printf(TEXT("'%s' value '%s' is not a valid id (letters, digits, underscore; max 64 characters)"), K, *S)); return NAME_None; }
			return FName(*S);
		}
		bool Bool(const TCHAR* K, bool Def)
		{
			const FJsonValue* V = Get(K); if (!V) return Def;
			if (V->Type != EJson::Boolean) { Err(TEXT("SCHEMA_TYPE"), FString::Printf(TEXT("field '%s' must be true or false"), K)); return Def; }
			return V->AsBool();
		}
		const TArray<FV>* Arr(const TCHAR* K, bool bReq)
		{
			const FJsonValue* V = Get(K);
			if (!V) { if (bReq) Err(TEXT("SCHEMA_MISSING_FIELD"), FString::Printf(TEXT("required list '%s' is missing"), K)); return nullptr; }
			if (V->Type != EJson::Array) { Err(TEXT("SCHEMA_TYPE"), FString::Printf(TEXT("field '%s' must be a list"), K)); return nullptr; }
			return &V->AsArray();
		}
		FJ Obj(const TCHAR* K, bool bReq)
		{
			const FJsonValue* V = Get(K);
			if (!V) { if (bReq) Err(TEXT("SCHEMA_MISSING_FIELD"), FString::Printf(TEXT("required object '%s' is missing"), K)); return nullptr; }
			if (V->Type != EJson::Object) { Err(TEXT("SCHEMA_TYPE"), FString::Printf(TEXT("field '%s' must be an object"), K)); return nullptr; }
			return V->AsObject();
		}
		void Finish() const { for (const TPair<FString, FV>& P : O->Values) if (!Seen.Contains(P.Key)) Err(TEXT("SCHEMA_UNKNOWN_FIELD"), FString::Printf(TEXT("unknown field '%s' (typo? the schema is strict)"), *P.Key)); }
	};

	FSrc Open(const FJ& O, const FString& Where, FMRValidationReport& R) { FSrc S; S.O = O; S.Where = Where; S.R = &R; return S; }
	FJ ElemObj(const FV& V, const FString& Where, FMRValidationReport& R)
	{
		if (!V.IsValid() || V->Type != EJson::Object) { R.Error(TEXT("SCHEMA_TYPE"), FName(*Where), TEXT("list entries must be objects")); return nullptr; }
		return V->AsObject();
	}

	template <typename E> bool ParseEnum(const FSrc& S, const FString& V, const TCHAR* Field, std::initializer_list<TPair<const TCHAR*, E>> Map, E& Out)
	{
		for (const TPair<const TCHAR*, E>& P : Map) if (V == P.Key) { Out = P.Value; return true; }
		FString Allowed; for (const TPair<const TCHAR*, E>& P : Map) Allowed += FString(P.Key) + TEXT(" ");
		S.Err(TEXT("SCHEMA_ENUM"), FString::Printf(TEXT("'%s' value '%s' is not one of: %s"), Field, *V, *Allowed.TrimEnd()));
		return false;
	}

	void ParseProvenance(FSrc& S, UMRNarrativeRecordBase* Rec)
	{
		Rec->bTestFixture = S.Bool(TEXT("testFixture"), false);
		if (FJ P = S.Obj(TEXT("provenance"), false))
		{
			FSrc PS = Open(P, S.Where + TEXT(".provenance"), *S.R);
			Rec->Provenance.SourceDocumentId = PS.Id(TEXT("sourceDocumentId"), false);
			Rec->Provenance.ApprovalId = PS.Id(TEXT("approvalId"), false);
			Rec->Provenance.Note = PS.Str(TEXT("note"), false);
			PS.Finish();
		}
	}

	void ParseEffects(FSrc& Owner, const TCHAR* Field, TArray<FMRDialogueEffect>& Out)
	{
		const TArray<FV>* A = Owner.Arr(Field, false); if (!A) return;
		int32 I = 0;
		for (const FV& V : *A)
		{
			const FString W = FString::Printf(TEXT("%s.%s[%d]"), *Owner.Where, Field, I++);
			FJ O = ElemObj(V, W, *Owner.R); if (!O) continue;
			FSrc S = Open(O, W, *Owner.R); FMRDialogueEffect E;
			ParseEnum<EMREffectType>(S, S.Str(TEXT("type"), true), TEXT("type"), { {TEXT("set_fact"), EMREffectType::SetFact}, {TEXT("clear_fact"), EMREffectType::ClearFact}, {TEXT("offer_mission"), EMREffectType::OfferMission}, {TEXT("accept_mission"), EMREffectType::AcceptMission}, {TEXT("complete_objective"), EMREffectType::CompleteObjective}, {TEXT("emit_event"), EMREffectType::EmitEvent} }, E.Type);
			E.Subject = S.Id(TEXT("subject"), true); E.bOneTime = S.Bool(TEXT("oneTime"), false); E.EffectId = S.Id(TEXT("effectId"), false);
			S.Finish(); Out.Add(E);
		}
	}

	void ParseConditions(FSrc& Owner, const TCHAR* Field, TArray<FMRDialogueCondition>& Out)
	{
		const TArray<FV>* A = Owner.Arr(Field, false); if (!A) return;
		int32 I = 0;
		for (const FV& V : *A)
		{
			const FString W = FString::Printf(TEXT("%s.%s[%d]"), *Owner.Where, Field, I++);
			FJ O = ElemObj(V, W, *Owner.R); if (!O) continue;
			FSrc S = Open(O, W, *Owner.R); FMRDialogueCondition C;
			ParseEnum<EMRConditionType>(S, S.Str(TEXT("type"), true), TEXT("type"), { {TEXT("fact_set"), EMRConditionType::FactSet}, {TEXT("fact_not_set"), EMRConditionType::FactNotSet}, {TEXT("mission_status"), EMRConditionType::MissionStatus}, {TEXT("dialogue_completed"), EMRConditionType::DialogueCompleted}, {TEXT("objective_completed"), EMRConditionType::ObjectiveCompleted} }, C.Type);
			C.Subject = S.Id(TEXT("subject"), true);
			const FString St = S.Str(TEXT("status"), C.Type == EMRConditionType::MissionStatus);
			if (!St.IsEmpty()) ParseEnum<EMRQuestStatus>(S, St, TEXT("status"), { {TEXT("not_offered"), EMRQuestStatus::NotOffered}, {TEXT("offered"), EMRQuestStatus::Offered}, {TEXT("active"), EMRQuestStatus::Active}, {TEXT("completed"), EMRQuestStatus::Completed} }, C.Status);
			S.Finish(); Out.Add(C);
		}
	}


	// ---- duplicate JSON object keys (UE's parser silently keeps the last one) ------------------------------------
	struct FDupScan
	{
		const FString& T; int32 I = 0; TArray<FString>& Out;
		FDupScan(const FString& InT, TArray<FString>& InOut) : T(InT), Out(InOut) {}
		void Ws() { while (I < T.Len() && FChar::IsWhitespace(T[I])) ++I; }
		bool Str(FString& S)
		{
			if (I >= T.Len() || T[I] != '"') return false;
			++I; S.Reset();
			while (I < T.Len() && T[I] != '"') { if (T[I] == '\\' && I + 1 < T.Len()) { S.AppendChar(T[I]); ++I; } S.AppendChar(T[I]); ++I; }
			if (I >= T.Len()) return false;
			++I; return true;
		}
		bool Value(const FString& Path, int32 Depth)
		{
			if (Depth > 128) return false;
			Ws(); if (I >= T.Len()) return false;
			const TCHAR C = T[I];
			if (C == '{')
			{
				++I; TSet<FString> Keys; Ws();
				if (I < T.Len() && T[I] == '}') { ++I; return true; }
				for (;;)
				{
					Ws(); FString K; if (!Str(K)) return false;
					Ws(); if (I >= T.Len() || T[I] != ':') return false; ++I;
					if (Keys.Contains(K)) Out.Add(FString::Printf(TEXT("duplicate key '%s' in the object at %s"), *K, *Path));
					Keys.Add(K);
					if (!Value(Path + TEXT(".") + K, Depth + 1)) return false;
					Ws(); if (I >= T.Len()) return false;
					if (T[I] == ',') { ++I; continue; }
					if (T[I] == '}') { ++I; return true; }
					return false;
				}
			}
			if (C == '[')
			{
				++I; Ws(); if (I < T.Len() && T[I] == ']') { ++I; return true; }
				for (int32 N = 0;; ++N)
				{
					if (!Value(FString::Printf(TEXT("%s[%d]"), *Path, N), Depth + 1)) return false;
					Ws(); if (I >= T.Len()) return false;
					if (T[I] == ',') { ++I; continue; }
					if (T[I] == ']') { ++I; return true; }
					return false;
				}
			}
			if (C == '"') { FString S; return Str(S); }
			while (I < T.Len() && !FChar::IsWhitespace(T[I]) && T[I] != ',' && T[I] != '}' && T[I] != ']') ++I;   // number / true / false / null
			return true;
		}
	};

	bool ReadJsonFile(const FString& Path, FJ& Out, FMRValidationReport& R, const FString& Label, FString* RawBytesHash = nullptr)
	{
		TArray<uint8> Bytes;
		if (!FFileHelper::LoadFileToArray(Bytes, *Path)) { R.Error(TEXT("SOURCE_UNREADABLE"), FName(*Label), FString::Printf(TEXT("cannot read '%s'"), *Path)); return false; }
		if (RawBytesHash) *RawBytesHash = FSHA1::HashBuffer(Bytes.GetData(), Bytes.Num()).ToString();
		FString Text; FFileHelper::BufferToString(Text, Bytes.GetData(), Bytes.Num());
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
		if (!FJsonSerializer::Deserialize(Reader, Out) || !Out.IsValid()) { R.Error(TEXT("JSON_PARSE"), FName(*Label), FString::Printf(TEXT("'%s' is not valid JSON (%s)"), *Path, *Reader->GetErrorMessage())); return false; }
		TArray<FString> Dups; FDupScan Scan(Text, Dups); Scan.Value(TEXT("$"), 0);
		for (const FString& D : Dups) R.Error(TEXT("DUPLICATE_KEY"), FName(*Label), FString::Printf(TEXT("%s (a duplicated key would silently override the earlier value; remove one)"), *D));
		return true;
	}

	FString ReceiptPath(const FString& Root, const FString& Id) { return FMRNarrativeImporter::BundleDir(Root, Id) / TEXT("ACTIVE.json"); }
}

// ---------------------------------------------------------------------------------------------------------------
bool FMRNarrativeImporter::IsValidId(const FString& Id)
{
	if (Id.IsEmpty() || Id.Len() > 64) return false;
	for (TCHAR C : Id) if (!(FChar::IsAlnum(C) && C < 128) && C != '_') return false;
	return true;
}

FString FMRNarrativeImporter::BundleDir(const FString& Root, const FString& Id)
{
	return FPaths::ConvertRelativePathToFull(FPackageName::LongPackageNameToFilename(Root / Id, TEXT("")));
}

FString FMRNarrativeImporter::Sha1OfFile(const FString& Path)
{
	TArray<uint8> B; if (!FFileHelper::LoadFileToArray(B, *Path)) return FString();
	return FSHA1::HashBuffer(B.GetData(), B.Num()).ToString();
}

FString FMRImportReport::Summary() const
{
	static const TCHAR* Names[] = { TEXT("REJECTED"), TEXT("VALIDATED_ONLY"), TEXT("IMPORTED"), TEXT("UNCHANGED"), TEXT("FAILED") };
	FString S = FString::Printf(TEXT("%s bundle=%s hash=%s errors=%d warnings=%d %s\n"), Names[(int32)Outcome], *BundleId, *BundleHash.Left(12), Validation.NumErrors(), Validation.Items.Num() - Validation.NumErrors(), *Message);
	S += Validation.Summary();
	for (const FString& I : Impact) S += TEXT("IMPACT ") + I + TEXT("\n");
	return S;
}

// ---------------------------------------------------------------------------------------------------------------
bool FMRNarrativeImporter::Stage(const FMRImportOptions& Opt, FMRStagedBundle& St, FMRValidationReport& R)
{
	St.SourceDir = Opt.SourceDir;
	const FString ManifestPath = Opt.SourceDir / TEXT("bundle.json");
	FJ M; if (!ReadJsonFile(ManifestPath, M, R, TEXT("bundle.json"))) return false;
	// The identity hash covers canonical CONTENT only (whitespace/key order and the raw per-file sha1 integrity fields are excluded), so merely
	// reformatting a reviewed file is not a content change.
	FJ MCanon = MakeShared<FJsonObject>();
	for (const TPair<FString, FV>& P : M->Values)
	{
		if (P.Key != TEXT("files")) { MCanon->SetField(P.Key, P.Value); continue; }
		TArray<FV> Paths;
		if (P.Value.IsValid() && P.Value->Type == EJson::Array) for (const FV& E : P.Value->AsArray()) if (E.IsValid() && E->Type == EJson::Object) { FJ PO = MakeShared<FJsonObject>(); if (const FV* PV = E->AsObject()->Values.Find(TEXT("path"))) PO->SetField(TEXT("path"), *PV); Paths.Add(MakeShared<FJsonValueObject>(PO)); }
		MCanon->SetArrayField(TEXT("files"), Paths);
	}
	FString Hash = TEXT("manifest:") + Canon(MCanon);

	FSrc MS = Open(M, TEXT("bundle.json"), R);
	if (const FJsonValue* V = MS.Get(TEXT("schemaVersion"))) { if (V->Type != EJson::Number || (int32)V->AsNumber() != SchemaVersion) MS.Err(TEXT("SCHEMA_VERSION"), FString::Printf(TEXT("unsupported schemaVersion (this importer reads %d)"), SchemaVersion)); }
	else MS.Err(TEXT("SCHEMA_MISSING_FIELD"), TEXT("required field 'schemaVersion' is missing"));
	St.BundleId = MS.Str(TEXT("bundleId"), true);
	if (!St.BundleId.IsEmpty() && !IsValidId(St.BundleId)) MS.Err(TEXT("INVALID_ID"), TEXT("bundleId is not a valid id"));
	const FString Cls = MS.Str(TEXT("classification"), true);
	if (!Cls.IsEmpty()) ParseEnum<EMRBundleClass>(MS, Cls, TEXT("classification"), { {TEXT("TEST_FIXTURE"), EMRBundleClass::Fixture}, {TEXT("PRODUCTION"), EMRBundleClass::Production} }, St.Classification);
	St.DialogueVersion = MS.Id(TEXT("dialogueVersion"), true); St.QuestVersion = MS.Id(TEXT("questVersion"), true);
	if (FJ A = MS.Obj(TEXT("approval"), false))
	{
		FSrc AS = Open(A, TEXT("bundle.json.approval"), R);
		St.Approval.ApprovalId = AS.Str(TEXT("approvalId"), true); St.Approval.ApprovedBy = AS.Str(TEXT("approvedBy"), true);
		St.Approval.ApprovedOn = AS.Str(TEXT("approvedOn"), true); St.Approval.SourceDocumentId = AS.Str(TEXT("sourceDocumentId"), true);
		AS.Finish();
	}
	if (const TArray<FV>* MA = MS.Arr(TEXT("effectMigrations"), false))
	{
		int32 MI = 0;
		for (const FV& V : *MA)
		{
			const FString W = FString::Printf(TEXT("bundle.json.effectMigrations[%d]"), MI++);
			FJ MO = ElemObj(V, W, R); if (!MO) continue;
			FSrc XS = Open(MO, W, R); FMREffectMigration X;
			X.From = XS.Id(TEXT("from"), true); X.ApprovalId = XS.Id(TEXT("approvalId"), true);
			const FString Act = XS.Str(TEXT("action"), true); X.To = XS.Id(TEXT("to"), Act == TEXT("rename"));
			if (!Act.IsEmpty()) ParseEnum<bool>(XS, Act, TEXT("action"), { {TEXT("rename"), false}, {TEXT("retire"), true} }, X.bRetire);
			XS.Finish(); St.Migrations.Add(X);
		}
	}
	const bool bProduction = St.Classification == EMRBundleClass::Production || Opt.bForceProductionPolicy;
	if (St.Classification == EMRBundleClass::Production && !M->Values.Contains(TEXT("approval")))
		R.Error(TEXT("MISSING_APPROVAL"), FName("bundle.json"), TEXT("a PRODUCTION bundle needs an 'approval' block (approvalId, approvedBy, approvedOn, sourceDocumentId)"));

	// files
	struct FFile { FString Path, Kind; FJ Json; };
	TArray<FFile> Files; TSet<FString> Listed;
	if (const TArray<FV>* FA = MS.Arr(TEXT("files"), true))
	{
		int32 I = 0;
		for (const FV& V : *FA)
		{
			const FString W = FString::Printf(TEXT("bundle.json.files[%d]"), I++);
			FJ FO = ElemObj(V, W, R); if (!FO) continue;
			FSrc FS = Open(FO, W, R);
			const FString Rel = FS.Str(TEXT("path"), true), Want = FS.Str(TEXT("sha1"), true); FS.Finish();
			if (Rel.IsEmpty()) continue;
			if (Rel.Contains(TEXT("..")) || FPaths::IsRelative(Rel) == false || Rel.Contains(TEXT("\\"))) { R.Error(TEXT("BAD_PATH"), FName(*Rel), TEXT("manifest paths must be plain relative paths inside the bundle directory")); continue; }
			if (Listed.Contains(Rel)) { R.Error(TEXT("DUPLICATE_ID"), FName(*Rel), TEXT("file listed twice in the manifest")); continue; }
			Listed.Add(Rel);
			FFile F; F.Path = Rel; FString Got;
			if (!ReadJsonFile(Opt.SourceDir / Rel, F.Json, R, Rel, &Got)) continue;
			if (!Want.IsEmpty() && !Got.Equals(Want, ESearchCase::IgnoreCase)) R.Error(TEXT("HASH_MISMATCH"), FName(*Rel), FString::Printf(TEXT("sha1 %s does not match the manifest (%s): the file changed after review; update the manifest hash only through review"), *Got, *Want));
			Hash += TEXT("|") + Rel + TEXT(":") + Canon(F.Json);
			Files.Add(F);
		}
	}
	MS.Finish();
	TArray<FString> OnDisk; IFileManager::Get().FindFiles(OnDisk, *(Opt.SourceDir / TEXT("*.json")), true, false);
	for (const FString& N : OnDisk) if (N != TEXT("bundle.json") && !Listed.Contains(N)) R.Error(TEXT("UNLISTED_FILE"), FName(*N), TEXT("a JSON file in the bundle directory is not listed in the manifest (unreviewed content is never imported)"));
	St.BundleHash = HashText(Hash);

	UObject* Outer = GetTransientPackage();
	auto Keep = [&St](UObject* O) { St.Keep.Add(TStrongObjectPtr<UObject>(O)); return O; };
	auto Fill = [&](FSrc& S, UMRNarrativeRecordBase* Rec, FName Version)
	{
		ParseProvenance(S, Rec);
		const FString CV = S.Str(TEXT("contentVersion"), false);
		if (!CV.IsEmpty() && FName(*CV) != Version) S.Err(TEXT("VERSION_CONFLICT"), FString::Printf(TEXT("record contentVersion '%s' conflicts with the bundle version '%s'"), *CV, *Version.ToString()));
		Rec->ContentVersion = Version;
	};
	TSet<FName> TableIds;

	for (const FFile& F : Files)
	{
		FSrc FS = Open(F.Json, F.Path, R);
		if (const FJsonValue* V = FS.Get(TEXT("schemaVersion"))) { if (V->Type != EJson::Number || (int32)V->AsNumber() != SchemaVersion) FS.Err(TEXT("SCHEMA_VERSION"), TEXT("unsupported schemaVersion")); }
		else FS.Err(TEXT("SCHEMA_MISSING_FIELD"), TEXT("required field 'schemaVersion' is missing"));
		const FString Kind = FS.Str(TEXT("kind"), true);

		if (Kind == TEXT("strings"))
		{
			const FName Table = FS.Id(TEXT("tableId"), true); const FString Locale = FS.Str(TEXT("locale"), false);
			TMap<FName, FString> Entries;
			if (FJ E = FS.Obj(TEXT("entries"), true))
				for (const TPair<FString, FV>& P : E->Values)
				{
					if (!IsValidId(P.Key)) R.Error(TEXT("INVALID_ID"), FName(*F.Path), FString::Printf(TEXT("string key '%s' is not a valid id"), *P.Key));
					else if (!P.Value.IsValid() || P.Value->Type != EJson::String) R.Error(TEXT("SCHEMA_TYPE"), FName(*F.Path), FString::Printf(TEXT("string '%s' must be a text value"), *P.Key));
					else Entries.Add(FName(*P.Key), P.Value->AsString());
				}
			FS.Finish();
			if (Table.IsNone()) continue;
			if (TableIds.Contains(Table)) { R.Error(TEXT("DUPLICATE_ID"), FName(*F.Path), TEXT("duplicate string table id ") + Table.ToString()); continue; }
			TableIds.Add(Table); St.Strings.Add(Table, Entries);
			St.RecordHashes.Add(TEXT("strings:") + Table.ToString(), HashText(Canon(F.Json)));
			if (bProduction) for (const TPair<FName, FString>& E : Entries) if (E.Value.StartsWith(TEXT("TEST FIXTURE - NONCANON"))) R.Error(TEXT("PRODUCTION_FIXTURE_TEXT"), FName(*F.Path), FString::Printf(TEXT("string '%s' carries the TEST FIXTURE - NONCANON label; fixture text can never enter production"), *E.Key.ToString()));
			(void)Locale;
		}
		else if (Kind == TEXT("npcs") || Kind == TEXT("dialogues") || Kind == TEXT("missions"))
		{
			const TArray<FV>* Recs = FS.Arr(TEXT("records"), true); FS.Finish();
			if (!Recs) continue;
			int32 Idx = 0;
			for (const FV& V : *Recs)
			{
				const FString W = FString::Printf(TEXT("%s#%d"), *F.Path, Idx++);
				FJ O = ElemObj(V, W, R); if (!O) continue;
				FSrc S = Open(O, W, R);
				const FString RecHash = HashText(Canon(O));
				if (Kind == TEXT("npcs"))
				{
					UMRNpcRecord* N = NewObject<UMRNpcRecord>(Outer); Keep(N);
					N->RecordId = S.Id(TEXT("id"), true); S.Where = W + TEXT(":") + N->RecordId.ToString();
					N->StringTableId = S.Id(TEXT("stringTable"), true); N->DisplayNameKey = S.Id(TEXT("displayNameKey"), true);
					N->DefaultDialogueGraphId = S.Id(TEXT("defaultDialogueId"), false); N->AvailabilityFact = S.Id(TEXT("availabilityFact"), false);
					Fill(S, N, St.DialogueVersion); N->SourceRecordHash = RecHash; S.Finish();
					St.Bundle.Npcs.Add(N); if (!N->RecordId.IsNone()) St.RecordHashes.Add(TEXT("npc:") + N->RecordId.ToString(), RecHash);
				}
				else if (Kind == TEXT("dialogues"))
				{
					UMRDialogueGraph* G = NewObject<UMRDialogueGraph>(Outer); Keep(G);
					G->RecordId = S.Id(TEXT("id"), true); S.Where = W + TEXT(":") + G->RecordId.ToString();
					G->NpcId = S.Id(TEXT("npcId"), true); G->StringTableId = S.Id(TEXT("stringTable"), true); G->StartNodeId = S.Id(TEXT("start"), true);
					Fill(S, G, St.DialogueVersion);
					if (const TArray<FV>* Nodes = S.Arr(TEXT("nodes"), true))
					{
						int32 NI = 0;
						for (const FV& NV : *Nodes)
						{
							const FString NW = FString::Printf(TEXT("%s.nodes[%d]"), *S.Where, NI++);
							FJ NO = ElemObj(NV, NW, R); if (!NO) continue;
							FSrc NS = Open(NO, NW, R); FMRDialogueNode Node;
							Node.NodeId = NS.Id(TEXT("id"), true);
							ParseEnum<EMRDialogueNodeType>(NS, NS.Str(TEXT("type"), true), TEXT("type"), { {TEXT("line"), EMRDialogueNodeType::Line}, {TEXT("choice"), EMRDialogueNodeType::Choice}, {TEXT("branch"), EMRDialogueNodeType::Branch}, {TEXT("end"), EMRDialogueNodeType::End} }, Node.Type);
							Node.SpeakerNpcId = NS.Id(TEXT("speaker"), false); Node.TextKey = NS.Id(TEXT("textKey"), false); Node.NextNodeId = NS.Id(TEXT("next"), false); Node.CompletionEventId = NS.Id(TEXT("completionEvent"), false);
							ParseEffects(NS, TEXT("onEnter"), Node.OnEnterEffects);
							if (const TArray<FV>* Chs = NS.Arr(TEXT("choices"), false))
							{
								int32 CI = 0;
								for (const FV& CV : *Chs)
								{
									const FString CW = FString::Printf(TEXT("%s.choices[%d]"), *NW, CI++);
									FJ CO = ElemObj(CV, CW, R); if (!CO) continue;
									FSrc CS = Open(CO, CW, R); FMRDialogueChoice Ch;
									Ch.ChoiceId = CS.Id(TEXT("id"), true); Ch.TextKey = CS.Id(TEXT("textKey"), false); Ch.NextNodeId = CS.Id(TEXT("next"), true);
									ParseConditions(CS, TEXT("conditions"), Ch.Conditions); ParseEffects(CS, TEXT("effects"), Ch.Effects);
									CS.Finish(); Node.Choices.Add(Ch);
								}
							}
							NS.Finish();
							for (const FMRDialogueEffect& E : Node.OnEnterEffects) if (E.bOneTime && !E.EffectId.IsNone()) St.EffectIds.Add(E.EffectId);
							for (const FMRDialogueChoice& C : Node.Choices) for (const FMRDialogueEffect& E : C.Effects) if (E.bOneTime && !E.EffectId.IsNone()) St.EffectIds.Add(E.EffectId);
							G->Nodes.Add(Node);
						}
					}
					G->SourceRecordHash = RecHash; S.Finish();
					St.Bundle.Graphs.Add(G); if (!G->RecordId.IsNone()) St.RecordHashes.Add(TEXT("dialogue:") + G->RecordId.ToString(), RecHash);
				}
				else
				{
					UMRMissionRecord* Ms = NewObject<UMRMissionRecord>(Outer); Keep(Ms);
					Ms->RecordId = S.Id(TEXT("id"), true); S.Where = W + TEXT(":") + Ms->RecordId.ToString();
					Ms->StringTableId = S.Id(TEXT("stringTable"), true); Ms->TitleKey = S.Id(TEXT("titleKey"), true); Ms->SummaryKey = S.Id(TEXT("summaryKey"), false); Ms->OfferingNpcId = S.Id(TEXT("offeringNpcId"), false);
					Fill(S, Ms, St.QuestVersion);
					if (const TArray<FV>* Objs = S.Arr(TEXT("objectives"), true))
					{
						int32 OI = 0;
						for (const FV& OV : *Objs)
						{
							const FString OW = FString::Printf(TEXT("%s.objectives[%d]"), *S.Where, OI++);
							FJ OO = ElemObj(OV, OW, R); if (!OO) continue;
							FSrc OS = Open(OO, OW, R); FMRObjectiveDef D;
							D.ObjectiveId = OS.Id(TEXT("id"), true); D.TextKey = OS.Id(TEXT("textKey"), true); D.CompletionEventId = OS.Id(TEXT("completionEvent"), true);
							OS.Finish(); Ms->Objectives.Add(D);
						}
					}
					Ms->SourceRecordHash = RecHash; S.Finish();
					St.Bundle.Missions.Add(Ms); if (!Ms->RecordId.IsNone()) St.RecordHashes.Add(TEXT("mission:") + Ms->RecordId.ToString(), RecHash);
				}
			}
		}
		else FS.Err(TEXT("SCHEMA_ENUM"), FString::Printf(TEXT("kind '%s' is not one of: strings npcs dialogues missions"), *Kind));
	}

	// classification rules
	auto CheckClass = [&](const UMRNarrativeRecordBase* Rec)
	{
		if (!Rec || Rec->RecordId.IsNone()) return;
		if (St.Classification == EMRBundleClass::Fixture && !Rec->bTestFixture) R.Error(TEXT("CLASSIFICATION_MISMATCH"), Rec->RecordId, TEXT("a TEST_FIXTURE bundle may only contain records marked testFixture:true"));
		if (St.Classification == EMRBundleClass::Production && Rec->bTestFixture) R.Error(TEXT("CLASSIFICATION_MISMATCH"), Rec->RecordId, TEXT("a PRODUCTION bundle may not contain testFixture records"));
	};
	for (const UMRNpcRecord* N : St.Bundle.Npcs) CheckClass(N);
	for (const UMRDialogueGraph* G : St.Bundle.Graphs) CheckClass(G);
	for (const UMRMissionRecord* Ms : St.Bundle.Missions) CheckClass(Ms);

	// full semantic validation against the STAGED strings (nothing is registered or written)
	FMRValidationPolicy Policy; Policy.bAllowTestFixtures = !bProduction;
	const TFunction<bool(FName, FName)> Lookup = [&St](FName Table, FName Key) { const TMap<FName, FString>* T = St.Strings.Find(Table); return T && T->Contains(Key); };
	MRNarrative::ValidateBundle(St.Bundle, Policy, R, &Lookup);
	TSet<FName> MigFrom;
	for (const FMREffectMigration& X : St.Migrations)
	{
		const FName Rec = FName(*(TEXT("effectMigration:") + X.From.ToString()));
		if (X.From.IsNone()) continue;
		if (MigFrom.Contains(X.From)) R.Error(TEXT("DUPLICATE_ID"), Rec, TEXT("more than one migration for the same 'from' effect id"));
		MigFrom.Add(X.From);
		if (St.EffectIds.Contains(X.From)) R.Error(TEXT("MIGRATION_SOURCE_STILL_PRESENT"), Rec, TEXT("the 'from' effect id still exists in this bundle; a migration is only for ids that were renamed or removed"));
		if (!X.bRetire)
		{
			if (X.To == X.From) R.Error(TEXT("MIGRATION_INVALID"), Rec, TEXT("'to' must differ from 'from'"));
			else if (!St.EffectIds.Contains(X.To)) R.Error(TEXT("MIGRATION_TARGET_MISSING"), Rec, FString::Printf(TEXT("'to' effect id '%s' is not a one-time effect in this bundle"), *X.To.ToString()));
		}
	}
	return !R.HasErrors();
}

// ---------------------------------------------------------------------------------------------------------------
static FMRActiveReceipt ReadMetaFile(const FString& Path)
{
	FMRActiveReceipt Rc; FJ O; FMRValidationReport Ignore;
	if (!IFileManager::Get().FileExists(*Path) || !ReadJsonFile(Path, O, Ignore, TEXT("meta"))) return Rc;
	O->TryGetStringField(TEXT("bundleId"), Rc.BundleId); O->TryGetStringField(TEXT("bundleHash"), Rc.BundleHash); O->TryGetStringField(TEXT("classification"), Rc.Classification);
	O->TryGetStringField(TEXT("dialogueVersion"), Rc.DialogueVersion); O->TryGetStringField(TEXT("questVersion"), Rc.QuestVersion);
	if (const TSharedPtr<FJsonObject>* Recs; O->TryGetObjectField(TEXT("records"), Recs)) for (const TPair<FString, FV>& P : (*Recs)->Values) Rc.Records.Add(FString(*P.Key), P.Value->AsString());
	const TArray<FV>* A;
	if (O->TryGetArrayField(TEXT("effectIds"), A)) for (const FV& V : *A) Rc.EffectIds.Add(V->AsString());
	if (O->TryGetArrayField(TEXT("assets"), A)) for (const FV& V : *A) Rc.Assets.Add(V->AsString());
	if (O->TryGetArrayField(TEXT("effectMigrations"), A))
		for (const FV& V : *A) { const FJ M = V->AsObject(); FMREffectMigration X; X.From = FName(*M->GetStringField(TEXT("from"))); X.To = FName(*M->GetStringField(TEXT("to"))); X.bRetire = M->GetBoolField(TEXT("retire")); X.ApprovalId = FName(*M->GetStringField(TEXT("approvalId"))); Rc.Migrations.Add(X); }
	Rc.bValid = !Rc.BundleHash.IsEmpty() && !Rc.BundleId.IsEmpty() && !Rc.DialogueVersion.IsEmpty() && !Rc.QuestVersion.IsEmpty() && !Rc.Classification.IsEmpty();
	return Rc;
}

FMRActiveReceipt FMRNarrativeImporter::ReadActive(const FString& Root, const FString& BundleId) { return ReadMetaFile(ReceiptPath(Root, BundleId)); }
FMRActiveReceipt FMRNarrativeImporter::ReadFolderMeta(const FString& Root, const FString& BundleId, const FString& Hash12) { return ReadMetaFile(BundleDir(Root, BundleId) / Hash12 / TEXT("COMPLETE.json")); }

static FJ MetaJson(const FMRStagedBundle& St, const TArray<FString>& Assets)
{
	FJ A = MakeShared<FJsonObject>();
	A->SetNumberField(TEXT("schemaVersion"), SchemaVersion); A->SetStringField(TEXT("bundleId"), St.BundleId); A->SetStringField(TEXT("bundleHash"), St.BundleHash);
	A->SetStringField(TEXT("classification"), St.Classification == EMRBundleClass::Production ? TEXT("PRODUCTION") : TEXT("TEST_FIXTURE"));
	A->SetStringField(TEXT("dialogueVersion"), St.DialogueVersion.ToString()); A->SetStringField(TEXT("questVersion"), St.QuestVersion.ToString());
	FJ Recs = MakeShared<FJsonObject>(); for (const TPair<FString, FString>& P : St.RecordHashes) Recs->SetStringField(P.Key, P.Value); A->SetObjectField(TEXT("records"), Recs);
	TArray<FV> EV; for (FName E : St.EffectIds) EV.Add(MakeShared<FJsonValueString>(E.ToString())); A->SetArrayField(TEXT("effectIds"), EV);
	TArray<FV> MV;
	for (const FMREffectMigration& X : St.Migrations)
	{ FJ M = MakeShared<FJsonObject>(); M->SetStringField(TEXT("from"), X.From.ToString()); M->SetStringField(TEXT("to"), X.To.ToString()); M->SetBoolField(TEXT("retire"), X.bRetire); M->SetStringField(TEXT("approvalId"), X.ApprovalId.ToString()); MV.Add(MakeShared<FJsonValueObject>(M)); }
	A->SetArrayField(TEXT("effectMigrations"), MV);
	TArray<FV> AV; for (const FString& S : Assets) AV.Add(MakeShared<FJsonValueString>(S)); A->SetArrayField(TEXT("assets"), AV);
	return A;
}

static FString PrettyJson(const FJ& O)
{
	FString T; const TSharedRef<TJsonWriter<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>> W = TJsonWriterFactory<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>::Create(&T);
	FJsonSerializer::Serialize(O.ToSharedRef(), W); return T;
}

static void AddImpact(const FMRActiveReceipt& Prev, const FMRStagedBundle& St, TArray<FString>& Impact)
{
	if (Prev.DialogueVersion != St.DialogueVersion.ToString()) Impact.Add(FString::Printf(TEXT("dialogue version %s -> %s: existing narrative saves load with a version-mismatch notice; their progress is KEPT and the save is re-stamped (never reset)"), *Prev.DialogueVersion, *St.DialogueVersion.ToString()));
	if (Prev.QuestVersion != St.QuestVersion.ToString()) Impact.Add(FString::Printf(TEXT("quest version %s -> %s: existing narrative saves load with a version-mismatch notice; mission progress is KEPT"), *Prev.QuestVersion, *St.QuestVersion.ToString()));
	for (const TPair<FString, FString>& P : St.RecordHashes)
	{
		const FString* Old = Prev.Records.Find(P.Key);
		if (!Old) Impact.Add(TEXT("ADDED ") + P.Key);
		else if (*Old != P.Value)
		{
			FString Note = P.Key.StartsWith(TEXT("dialogue:")) ? TEXT(" - completion record and one-time effect ledger (keyed by id) are kept; an interrupted conversation restarts from its first node (D-7)")
				: P.Key.StartsWith(TEXT("mission:")) ? TEXT(" - saved status is kept; the current objective is derived from the recorded completed objective ids") : FString();
			Impact.Add(TEXT("CHANGED ") + P.Key + Note);
		}
	}
	for (const TPair<FString, FString>& P : Prev.Records)
		if (!St.RecordHashes.Contains(P.Key))
			Impact.Add(TEXT("REMOVED ") + P.Key + (P.Key.StartsWith(TEXT("mission:")) ? TEXT(" - saved status is retained in existing saves but NOT applied; reported on load") : TEXT(" - ids recorded in existing saves are retained, unused")));
	for (const FString& E : Prev.EffectIds)
	{
		if (St.EffectIds.Contains(FName(*E))) continue;
		const FMREffectMigration* Mig = St.Migrations.FindByPredicate([&](const FMREffectMigration& X) { return X.From == FName(*E); });
		if (Mig && Mig->bRetire) Impact.Add(FString::Printf(TEXT("MIGRATED one-time effect id '%s' retired (approval %s): the old ledger entry is kept"), *E, *Mig->ApprovalId.ToString()));
		else if (Mig) Impact.Add(FString::Printf(TEXT("MIGRATED one-time effect id '%s' -> '%s' (approval %s): saved ledgers carry over, so it will not fire again"), *E, *Mig->To.ToString(), *Mig->ApprovalId.ToString()));
		else Impact.Add(FString::Printf(TEXT("WARNING one-time effect id '%s' was removed or renamed: players who already fired it keep the old ledger entry, and any replacement id will fire once more"), *E));
	}
}

FMRImportReport FMRNarrativeImporter::Import(const FMRImportOptions& Opt)
{
	FMRImportReport Rep; FMRStagedBundle St;
	Stage(Opt, St, Rep.Validation);
	Rep.BundleId = St.BundleId; Rep.BundleHash = St.BundleHash;
	if (Rep.Validation.HasErrors()) { Rep.Outcome = EMRImportOutcome::Rejected; Rep.Message = TEXT("source rejected; nothing written"); return Rep; }

	const FMRActiveReceipt Prev = ReadActive(Opt.OutputRoot, St.BundleId);
	if (Prev.bValid)
	{
		// the same version must mean the same content: changing a record without bumping the version is a conflict
		auto Differs = [&](const TCHAR* Prefix) { for (const TPair<FString, FString>& P : St.RecordHashes) if (P.Key.StartsWith(Prefix) && Prev.Records.FindRef(P.Key) != P.Value) return true; for (const TPair<FString, FString>& P : Prev.Records) if (P.Key.StartsWith(Prefix) && !St.RecordHashes.Contains(P.Key)) return true; return false; };
		const bool bDialogueSet = Differs(TEXT("npc:")) || Differs(TEXT("dialogue:")) || Differs(TEXT("strings:")), bQuestSet = Differs(TEXT("mission:"));
		if (Prev.BundleHash != St.BundleHash && bDialogueSet && Prev.DialogueVersion == St.DialogueVersion.ToString())
			Rep.Validation.Error(TEXT("VERSION_CONFLICT"), FName(*St.BundleId), FString::Printf(TEXT("dialogue/NPC/strings content changed but dialogueVersion is still '%s'; bump the version so saves can detect the change"), *Prev.DialogueVersion));
		if (Prev.BundleHash != St.BundleHash && bQuestSet && Prev.QuestVersion == St.QuestVersion.ToString())
			Rep.Validation.Error(TEXT("VERSION_CONFLICT"), FName(*St.BundleId), FString::Printf(TEXT("mission content changed but questVersion is still '%s'; bump the version so saves can detect the change"), *Prev.QuestVersion));
		if (Prev.Classification != (St.Classification == EMRBundleClass::Production ? TEXT("PRODUCTION") : TEXT("TEST_FIXTURE")))
			Rep.Validation.Error(TEXT("CLASSIFICATION_MISMATCH"), FName(*St.BundleId), TEXT("this bundle id was previously imported with a different classification; fixtures and production content never share a bundle id"));
		// one-time effect ids: PRODUCTION may not drop/rename one without an explicit approved migration; fixtures keep a warning
		const bool bProdChain = St.Classification == EMRBundleClass::Production && Prev.Classification == TEXT("PRODUCTION");
		for (const FMREffectMigration& X : St.Migrations) if (!X.From.IsNone() && !Prev.EffectIds.Contains(X.From.ToString())) Rep.Validation.Error(TEXT("MIGRATION_UNKNOWN_SOURCE"), FName(*(TEXT("effectMigration:") + X.From.ToString())), TEXT("the 'from' effect id is not a one-time effect of the previously active bundle"));
		for (const FString& E : Prev.EffectIds)
		{
			if (St.EffectIds.Contains(FName(*E)) || St.Migrations.ContainsByPredicate([&](const FMREffectMigration& X) { return X.From == FName(*E); })) continue;
			if (bProdChain) Rep.Validation.Error(TEXT("EFFECT_ID_MIGRATION_REQUIRED"), FName(*E), FString::Printf(TEXT("one-time effect id '%s' was removed or renamed; production content needs an explicit approved migration (manifest effectMigrations) so saved ledgers stay valid"), *E));
			else Rep.Validation.Warn(TEXT("EFFECT_ID_CHANGED"), FName(*E), FString::Printf(TEXT("one-time effect id '%s' was removed or renamed without a migration (development fixture: warning only)"), *E));
		}
		if (Rep.Validation.HasErrors()) { Rep.Outcome = EMRImportOutcome::Rejected; Rep.Message = TEXT("version/migration conflict; nothing written"); return Rep; }
		if (Prev.BundleHash != St.BundleHash) AddImpact(Prev, St, Rep.Impact);
	}
	const FString Hash12 = St.BundleHash.Left(12);
	const FString Dir = BundleDir(Opt.OutputRoot, St.BundleId), HashDir = Dir / Hash12;
	Rep.ActiveFolder = HashDir;
	if (!Opt.bCommit) { Rep.Outcome = EMRImportOutcome::ValidatedOnly; Rep.Message = TEXT("valid; commit not requested"); return Rep; }
	if (Prev.bValid && Prev.BundleHash == St.BundleHash && IFileManager::Get().FileExists(*(HashDir / TEXT("COMPLETE.json")))) { Rep.Outcome = EMRImportOutcome::Unchanged; Rep.Message = TEXT("identical content is already active; nothing written"); return Rep; }

#if WITH_EDITOR
	const bool bComplete = ReadFolderMeta(Opt.OutputRoot, St.BundleId, Hash12).bValid;   // a folder is only reusable if it is complete AND self-describing
	TArray<FString> Assets;   // object paths
	if (!bComplete)
	{
		if (IFileManager::Get().DirectoryExists(*HashDir)) IFileManager::Get().DeleteDirectory(*HashDir, false, true);   // an incomplete import of THIS content (generated, never ACTIVE)
		int32 Written = 0; bool bOk = true;
		auto Save = [&](UObject* Asset, const FString& Name, UPackage* Pkg) -> bool
		{
			if (GFailAfterAssets >= 0 && Written >= GFailAfterAssets) return false;   // simulated interruption
			const FString File = FPackageName::LongPackageNameToFilename(Pkg->GetName(), FPackageName::GetAssetPackageExtension());
			FSavePackageArgs Args; Args.TopLevelFlags = RF_Public | RF_Standalone; Args.SaveFlags = SAVE_NoError; Args.bSlowTask = false;
			if (!UPackage::SavePackage(Pkg, Asset, *File, Args)) return false;
			++Written; Assets.Add(Pkg->GetName() + TEXT(".") + Name); Rep.GeneratedAssets.Add(Pkg->GetName());
			return true;
		};
		auto Emit = [&](UObject* Staged, const FString& Name) -> bool
		{
			const FString PkgName = Opt.OutputRoot / St.BundleId / Hash12 / Name;
			UPackage* Pkg = CreatePackage(*PkgName);
			UObject* Copy = StaticDuplicateObject(Staged, Pkg, FName(*Name)); Copy->SetFlags(RF_Public | RF_Standalone);
			return Save(Copy, Name, Pkg);
		};
		for (UMRNpcRecord* N : St.Bundle.Npcs) if (bOk) bOk = Emit(N, TEXT("NPC_") + N->RecordId.ToString());
		for (UMRDialogueGraph* G : St.Bundle.Graphs) if (bOk) bOk = Emit(G, TEXT("DLG_") + G->RecordId.ToString());
		for (UMRMissionRecord* M : St.Bundle.Missions) if (bOk) bOk = Emit(M, TEXT("MSN_") + M->RecordId.ToString());
		for (const TPair<FName, TMap<FName, FString>>& T : St.Strings)
			if (bOk)
			{
				UMRNarrativeStringTable* S = NewObject<UMRNarrativeStringTable>(GetTransientPackage()); S->TableId = T.Key; S->Entries = T.Value; S->bTestFixture = St.Classification == EMRBundleClass::Fixture;
				bOk = Emit(S, TEXT("STR_") + T.Key.ToString());
			}
		if (!bOk) { Rep.Outcome = EMRImportOutcome::Failed; Rep.Message = TEXT("writing was interrupted/failed; the previously active bundle is untouched and the incomplete folder is not active"); Rep.Validation.Error(TEXT("IMPORT_INTERRUPTED"), FName(*St.BundleId), Rep.Message); return Rep; }
		if (!FFileHelper::SaveStringToFile(PrettyJson(MetaJson(St, Assets)), *(HashDir / TEXT("COMPLETE.json")))) { Rep.Outcome = EMRImportOutcome::Failed; Rep.Message = TEXT("could not write the completion marker"); return Rep; }
	}
	else Assets = ReadFolderMeta(Opt.OutputRoot, St.BundleId, Hash12).Assets;

	// flip ACTIVE atomically (temp + move)
	const FString Text = PrettyJson(MetaJson(St, Assets));
	const FString Tmp = ReceiptPath(Opt.OutputRoot, St.BundleId) + TEXT(".tmp");
	if (!FFileHelper::SaveStringToFile(Text, *Tmp) || !IFileManager::Get().Move(*ReceiptPath(Opt.OutputRoot, St.BundleId), *Tmp, true, true)) { Rep.Outcome = EMRImportOutcome::Failed; Rep.Message = TEXT("could not activate the bundle; the previous one is untouched"); return Rep; }
	Rep.Outcome = EMRImportOutcome::Imported; Rep.Message = TEXT("imported and active");
	return Rep;
#else
	Rep.Outcome = EMRImportOutcome::Failed; Rep.Message = TEXT("asset generation is editor-only"); return Rep;
#endif
}

// ---------------------------------------------------------------------------------------------------------------
bool FMRNarrativeImporter::LoadFolder(const FString& Root, const FString& BundleId, const FString& Hash12, FMRLoadedBundle& Out, FMRValidationReport& R)
{
	Out.Meta = ReadFolderMeta(Root, BundleId, Hash12);
	const FName Rec = FName(*BundleId);
	if (!Out.Meta.bValid) { R.Error(TEXT("INCOMPLETE_BUNDLE"), Rec, TEXT("the bundle folder is missing, incomplete, or in an older format (no self-describing COMPLETE.json); re-import it")); return false; }
	if (!Out.Meta.BundleId.Equals(BundleId) || !Out.Meta.BundleHash.Left(12).Equals(Hash12, ESearchCase::IgnoreCase)) { R.Error(TEXT("IDENTITY_MISMATCH"), Rec, TEXT("the folder metadata does not match the requested bundle id/hash")); return false; }
	TMap<FString, FString> Seen;
	for (const FString& Path : Out.Meta.Assets)
	{
		UObject* O = StaticLoadObject(UObject::StaticClass(), nullptr, *Path);
		if (!O) { R.Error(TEXT("ASSET_MISSING"), FName(*Path), TEXT("a generated asset listed by the bundle cannot be loaded")); continue; }
		if (UMRNpcRecord* N = Cast<UMRNpcRecord>(O)) { Out.Bundle.Npcs.Add(N); Seen.Add(TEXT("npc:") + N->RecordId.ToString(), N->SourceRecordHash); }
		else if (UMRDialogueGraph* G = Cast<UMRDialogueGraph>(O)) { Out.Bundle.Graphs.Add(G); Seen.Add(TEXT("dialogue:") + G->RecordId.ToString(), G->SourceRecordHash); }
		else if (UMRMissionRecord* M = Cast<UMRMissionRecord>(O)) { Out.Bundle.Missions.Add(M); Seen.Add(TEXT("mission:") + M->RecordId.ToString(), M->SourceRecordHash); }
		else if (UMRNarrativeStringTable* S = Cast<UMRNarrativeStringTable>(O)) Out.Strings.Add(S->TableId, S->Entries);
		else R.Error(TEXT("ASSET_MISSING"), FName(*Path), TEXT("an asset of an unexpected class is listed by the bundle"));
	}
	if (R.HasErrors()) return false;
	// every record must be exactly what the importer recorded for this bundle
	for (const TPair<FString, FString>& P : Out.Meta.Records) if (!P.Key.StartsWith(TEXT("strings:")) && Seen.FindRef(P.Key) != P.Value) R.Error(TEXT("IDENTITY_MISMATCH"), FName(*P.Key), TEXT("record content does not match the hash recorded at import (modified or missing since import)"));
	for (const TPair<FString, FString>& P : Seen) if (!Out.Meta.Records.Contains(P.Key)) R.Error(TEXT("IDENTITY_MISMATCH"), FName(*P.Key), TEXT("a record exists in the folder that the import did not record"));
	return !R.HasErrors();
}

bool FMRNarrativeImporter::LoadActive(const FString& Root, const FString& BundleId, FMRNarrativeBundle& Out, FMRValidationReport& R, bool bProductionOnly)
{
	const FMRActiveReceipt Rc = ReadActive(Root, BundleId);
	if (!Rc.bValid) { R.Error(TEXT("NO_ACTIVE_BUNDLE"), FName(*BundleId), TEXT("no active imported bundle with this id")); return false; }
	if (bProductionOnly && Rc.Classification != TEXT("PRODUCTION")) { R.Error(TEXT("FIXTURE_NOT_ALLOWED"), FName(*BundleId), TEXT("the active bundle is a TEST_FIXTURE bundle; production loading refuses it")); return false; }
	FMRLoadedBundle L;
	if (!LoadFolder(Root, BundleId, Rc.BundleHash.Left(12), L, R)) return false;
	Out = L.Bundle;
	for (const TPair<FName, TMap<FName, FString>>& T : L.Strings) MRNarrative::RegisterStrings(T.Key, T.Value);
	FMRValidationPolicy Pol; Pol.bAllowTestFixtures = !bProductionOnly;
	MRNarrative::ValidateBundle(Out, Pol, R);
	return !R.HasErrors();
}

// ---------------------------------------------------------------------------------------------------------------
int32 UMRNarrativeImportCommandlet::Main(const FString& Params)
{
	FString Source, Out = TEXT("/Game/MoonRacer/Narrative/Generated");
	FParse::Value(*Params, TEXT("Source="), Source); FParse::Value(*Params, TEXT("Out="), Out);
	if (Source.IsEmpty()) { UE_LOG(LogMoonRacer, Error, TEXT("MRIMPORT|usage: -run=MRNarrativeImport -Source=<bundle dir> [-Out=/Game/...] [-ValidateOnly] [-Production]")); return 2; }
	FMRImportOptions Opt; Opt.SourceDir = FPaths::ConvertRelativePathToFull(Source); Opt.OutputRoot = Out;
	Opt.bCommit = !FParse::Param(*Params, TEXT("ValidateOnly")); Opt.bForceProductionPolicy = FParse::Param(*Params, TEXT("Production"));
	const FMRImportReport R = FMRNarrativeImporter::Import(Opt);
	TArray<FString> Lines; R.Summary().ParseIntoArrayLines(Lines);
	for (const FString& L : Lines) UE_LOG(LogMoonRacer, Display, TEXT("MRIMPORT|%s"), *L);
	UE_LOG(LogMoonRacer, Display, TEXT("MRIMPORT|RESULT|%s"), R.Ok() ? TEXT("OK") : TEXT("REJECTED_OR_FAILED"));
	return R.Ok() ? 0 : 1;
}
