#include "Narrative/MRNarrativeTypes.h"
#include "Internationalization/StringTableCore.h"
#include "Internationalization/StringTableRegistry.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "MoonRacer.h"

namespace
{
	EMREnvironment GEnvOverride = EMREnvironment::Unspecified;
}

namespace MRNarrative
{
	EMREnvironment CurrentEnvironment()
	{
#if UE_BUILD_SHIPPING
		return EMREnvironment::Production;
#else
		if (GEnvOverride != EMREnvironment::Unspecified) return GEnvOverride;
		FString V;
		if (FParse::Value(FCommandLine::Get(), TEXT("MRNarrativeEnv="), V) && V.Equals(TEXT("Production"), ESearchCase::IgnoreCase)) return EMREnvironment::Production;
		return EMREnvironment::Development;
#endif
	}
	void SetEnvironmentOverrideForTest(EMREnvironment Env)
	{
#if !UE_BUILD_SHIPPING
		GEnvOverride = Env;
#endif
	}

	FName UiTableId() { return FName("MR_NarrativeUI"); }

	void EnsureUiStrings()
	{
		if (FStringTableRegistry::Get().FindStringTable(UiTableId()).IsValid()) return;
		LOCTABLE_NEW("MR_NarrativeUI", "MRNarrativeUI");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "continue", "Continue");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "cancel", "Cancel");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "interact", "Press E to talk");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "player", "You");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "objective", "Objective");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "mission", "Mission");
		LOCTABLE_SETSTRING("MR_NarrativeUI", "unavailable", "Not available right now");
	}

	FText UiText(const TCHAR* Key)
	{
		EnsureUiStrings();
		return ResolveText(UiTableId(), FName(Key));
	}

	bool HasString(FName TableId, FName Key)
	{
		if (TableId.IsNone() || Key.IsNone()) return false;
		const FStringTableConstPtr T = FStringTableRegistry::Get().FindStringTable(TableId);
		if (!T.IsValid()) return false;
		FString Src;
		return T->GetSourceString(FTextKey(Key.ToString()), Src);
	}

	FText ResolveText(FName TableId, FName Key)
	{
		if (!HasString(TableId, Key))
		{
			UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|MISSING_TEXT|table=%s key=%s"), *TableId.ToString(), *Key.ToString());
			return FText::FromString(FString::Printf(TEXT("[MISSING TEXT %s/%s]"), *TableId.ToString(), *Key.ToString()));
		}
		return FText::FromStringTable(TableId, Key.ToString());
	}
}

void MRNarrative::RegisterStrings(FName TableId, const TMap<FName, FString>& Entries)
{
	FStringTableRegistry::Get().UnregisterStringTable(TableId);
	FStringTableRegistry::Get().Internal_NewLocTable(TableId, FTextKey(TEXT("MRNarrativeImported")));
	for (const TPair<FName, FString>& E : Entries) FStringTableRegistry::Get().Internal_SetLocTableEntry(TableId, FTextKey(E.Key.ToString()), E.Value);
}

const FMRDialogueNode* UMRDialogueGraph::FindNode(FName NodeId) const
{
	for (const FMRDialogueNode& N : Nodes) if (N.NodeId == NodeId) return &N;
	return nullptr;
}
