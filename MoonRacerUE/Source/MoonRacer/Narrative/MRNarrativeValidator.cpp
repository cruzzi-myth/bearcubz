#include "Narrative/MRNarrativeValidator.h"

namespace
{
	const TFunction<bool(FName, FName)>* GLookup = nullptr;
	bool HasStr(FName Table, FName Key) { return GLookup ? (*GLookup)(Table, Key) : MRNarrative::HasString(Table, Key); }

	const TCHAR* NodeTypeName(EMRDialogueNodeType T)
	{
		switch (T) { case EMRDialogueNodeType::Line: return TEXT("Line"); case EMRDialogueNodeType::Choice: return TEXT("Choice"); case EMRDialogueNodeType::Branch: return TEXT("Branch"); default: return TEXT("End"); }
	}

	struct FCtx
	{
		const FMRNarrativeBundle& B;
		FMRValidationReport& R;
		TSet<FName> NpcIds, GraphIds, MissionIds, ObjectiveIds;
		TSet<FName> FixtureIds;           // records flagged bTestFixture (any kind)
		TSet<FName> EffectIds;
	};

	void CheckRecordHeader(FCtx& C, const UMRNarrativeRecordBase* Rec, const TCHAR* Kind, const FMRValidationPolicy& P)
	{
		const FName Id = Rec->RecordId;
		if (Id.IsNone()) { C.R.Error(TEXT("EMPTY_ID"), FName(Kind), FString::Printf(TEXT("a %s record has no RecordId; give every record a stable id"), Kind)); return; }
		if (Rec->ContentVersion.IsNone()) C.R.Error(TEXT("MISSING_VERSION"), Id, TEXT("ContentVersion is empty; set the content version this record belongs to"));
		const bool bPrefixed = MRNarrative::HasFixturePrefix(Id);
		if (Rec->bTestFixture)
		{
			if (!P.bAllowTestFixtures) C.R.Error(TEXT("FIXTURE_NOT_ALLOWED"), Id, TEXT("test-fixture record present but fixtures are not allowed by the validation policy (production bundle?); remove it"));
			if (!bPrefixed) C.R.Error(TEXT("FIXTURE_ID_MISMATCH"), Id, TEXT("test-fixture records must have an id starting with TEST_FIXTURE_"));
			C.FixtureIds.Add(Id);
		}
		else
		{
			if (bPrefixed) C.R.Error(TEXT("FIXTURE_ID_MISMATCH"), Id, TEXT("only test-fixture records may use the TEST_FIXTURE_ id prefix; set bTestFixture or rename"));
			if (Rec->Provenance.SourceDocumentId.IsNone()) C.R.Error(TEXT("MISSING_PROVENANCE"), Id, TEXT("non-fixture records need Provenance.SourceDocumentId (the approved source)"));
			if (Rec->Provenance.ApprovalId.IsNone()) C.R.Error(TEXT("MISSING_PROVENANCE"), Id, TEXT("non-fixture records need Provenance.ApprovalId (who/what approved the content)"));
		}
	}

	void CheckConditions(FCtx& C, FName Owner, const FString& Where, const TArray<FMRDialogueCondition>& Conds)
	{
		for (const FMRDialogueCondition& K : Conds)
		{
			if (K.Subject.IsNone()) { C.R.Error(TEXT("BAD_CONDITION"), Owner, Where + TEXT(": condition has no Subject")); continue; }
			switch (K.Type)
			{
			case EMRConditionType::MissionStatus: if (!C.MissionIds.Contains(K.Subject)) C.R.Error(TEXT("UNKNOWN_MISSION"), Owner, Where + TEXT(": condition references unknown mission '") + K.Subject.ToString() + TEXT("'")); break;
			case EMRConditionType::DialogueCompleted: if (!C.GraphIds.Contains(K.Subject)) C.R.Error(TEXT("UNKNOWN_GRAPH"), Owner, Where + TEXT(": condition references unknown dialogue '") + K.Subject.ToString() + TEXT("'")); break;
			case EMRConditionType::ObjectiveCompleted: if (!C.ObjectiveIds.Contains(K.Subject)) C.R.Error(TEXT("UNKNOWN_OBJECTIVE"), Owner, Where + TEXT(": condition references unknown objective '") + K.Subject.ToString() + TEXT("'")); break;
			default: break;
			}
		}
	}

	void CheckEffects(FCtx& C, FName Owner, const FString& Where, const TArray<FMRDialogueEffect>& Effects)
	{
		for (const FMRDialogueEffect& E : Effects)
		{
			if (E.Subject.IsNone()) { C.R.Error(TEXT("BAD_EFFECT"), Owner, Where + TEXT(": effect has no Subject")); continue; }
			switch (E.Type)
			{
			case EMREffectType::OfferMission:
			case EMREffectType::AcceptMission: if (!C.MissionIds.Contains(E.Subject)) C.R.Error(TEXT("UNKNOWN_MISSION"), Owner, Where + TEXT(": effect references unknown mission '") + E.Subject.ToString() + TEXT("'")); break;
			case EMREffectType::CompleteObjective: if (!C.ObjectiveIds.Contains(E.Subject)) C.R.Error(TEXT("UNKNOWN_OBJECTIVE"), Owner, Where + TEXT(": effect references unknown objective '") + E.Subject.ToString() + TEXT("'")); break;
			default: break;
			}
			if (E.bOneTime)
			{
				if (E.EffectId.IsNone()) C.R.Error(TEXT("MISSING_EFFECT_ID"), Owner, Where + TEXT(": a one-time effect needs a stable EffectId"));
				else if (C.EffectIds.Contains(E.EffectId)) C.R.Error(TEXT("DUPLICATE_EFFECT_ID"), Owner, Where + TEXT(": EffectId '") + E.EffectId.ToString() + TEXT("' is used more than once; one-time ids must be unique across the bundle"));
				else C.EffectIds.Add(E.EffectId);
			}
		}
	}

	void CheckGraph(FCtx& C, const UMRDialogueGraph* G)
	{
		const FName Id = G->RecordId;
		if (Id.IsNone()) return;
		if (G->NpcId.IsNone() || !C.NpcIds.Contains(G->NpcId)) C.R.Error(TEXT("UNKNOWN_NPC"), Id, FString::Printf(TEXT("graph NpcId '%s' is not an NPC record in the bundle"), *G->NpcId.ToString()));
		if (G->StringTableId.IsNone()) C.R.Error(TEXT("STRINGTABLE_MISSING"), Id, TEXT("StringTableId is empty"));

		TSet<FName> NodeIds;
		for (const FMRDialogueNode& N : G->Nodes)
		{
			if (N.NodeId.IsNone()) { C.R.Error(TEXT("EMPTY_ID"), Id, TEXT("a dialogue node has no NodeId")); continue; }
			if (NodeIds.Contains(N.NodeId)) C.R.Error(TEXT("DUPLICATE_ID"), Id, TEXT("duplicate NodeId '") + N.NodeId.ToString() + TEXT("'; node ids must be unique within a graph"));
			NodeIds.Add(N.NodeId);
		}
		if (G->StartNodeId.IsNone() || !NodeIds.Contains(G->StartNodeId)) C.R.Error(TEXT("BAD_START"), Id, FString::Printf(TEXT("StartNodeId '%s' is not a node of this graph"), *G->StartNodeId.ToString()));

		auto CheckKey = [&](const FMRDialogueNode& N, FName Key, const TCHAR* What)
		{
			if (!HasStr(G->StringTableId, Key))
				C.R.Error(TEXT("MISSING_STRING_KEY"), Id, FString::Printf(TEXT("node '%s': %s key '%s' not found in string table '%s'; add the string or fix the key"), *N.NodeId.ToString(), What, *Key.ToString(), *G->StringTableId.ToString()));
		};
		auto CheckEdge = [&](const FMRDialogueNode& N, FName To, const FString& Via)
		{
			if (To.IsNone() || !NodeIds.Contains(To)) C.R.Error(TEXT("DANGLING_EDGE"), Id, FString::Printf(TEXT("node '%s' %s points to '%s', which is not a node of this graph"), *N.NodeId.ToString(), *Via, *To.ToString()));
		};

		bool bHasEnd = false;
		for (const FMRDialogueNode& N : G->Nodes)
		{
			if (N.NodeId.IsNone()) continue;
			const FString Where = FString::Printf(TEXT("node '%s'"), *N.NodeId.ToString());
			if (!N.SpeakerNpcId.IsNone() && !C.NpcIds.Contains(N.SpeakerNpcId)) C.R.Error(TEXT("UNKNOWN_NPC"), Id, Where + TEXT(": speaker '") + N.SpeakerNpcId.ToString() + TEXT("' is not an NPC record in the bundle"));
			CheckEffects(C, Id, Where + TEXT(" OnEnter"), N.OnEnterEffects);
			switch (N.Type)
			{
			case EMRDialogueNodeType::Line:
				CheckKey(N, N.TextKey, TEXT("text")); CheckEdge(N, N.NextNodeId, TEXT("NextNodeId"));
				if (N.Choices.Num() > 0) C.R.Warn(TEXT("IGNORED_CHOICES"), Id, Where + TEXT(": a Line node ignores its Choices; use a Choice node"));
				break;
			case EMRDialogueNodeType::Choice:
			case EMRDialogueNodeType::Branch:
			{
				const bool bChoice = N.Type == EMRDialogueNodeType::Choice;
				if (bChoice) CheckKey(N, N.TextKey, TEXT("text"));
				if (N.Choices.Num() == 0) { C.R.Error(TEXT("NO_CHOICES"), Id, Where + FString::Printf(TEXT(": a %s node needs at least one choice"), NodeTypeName(N.Type))); break; }
				TSet<FName> ChoiceIds; bool bUnconditional = false;
				for (const FMRDialogueChoice& Ch : N.Choices)
				{
					const FString CW = Where + TEXT(" choice '") + Ch.ChoiceId.ToString() + TEXT("'");
					if (Ch.ChoiceId.IsNone()) C.R.Error(TEXT("EMPTY_ID"), Id, Where + TEXT(": a choice has no ChoiceId"));
					else if (ChoiceIds.Contains(Ch.ChoiceId)) C.R.Error(TEXT("DUPLICATE_ID"), Id, CW + TEXT(": duplicate ChoiceId within the node"));
					ChoiceIds.Add(Ch.ChoiceId);
					if (bChoice) CheckKey(N, Ch.TextKey, TEXT("choice text"));
					CheckEdge(N, Ch.NextNodeId, TEXT("choice '") + Ch.ChoiceId.ToString() + TEXT("'"));
					CheckConditions(C, Id, CW, Ch.Conditions); CheckEffects(C, Id, CW, Ch.Effects);
					if (Ch.Conditions.Num() == 0) bUnconditional = true;
				}
				if (bChoice ? !bUnconditional : (!N.Choices.Last().Conditions.IsEmpty()))
					C.R.Error(TEXT("NO_FALLBACK_CHOICE"), Id, Where + (bChoice ? TEXT(": a Choice node needs at least one unconditional choice so the player can never be locked out") : TEXT(": the LAST choice of a Branch node must be unconditional (the default path)")));
				break;
			}
			case EMRDialogueNodeType::End:
				bHasEnd = true;
				if (!N.TextKey.IsNone()) CheckKey(N, N.TextKey, TEXT("text"));
				if (!N.NextNodeId.IsNone() || N.Choices.Num() > 0) C.R.Warn(TEXT("IGNORED_EDGES"), Id, Where + TEXT(": an End node ignores NextNodeId/Choices"));
				break;
			}
		}
		if (!bHasEnd) C.R.Error(TEXT("NO_END_NODE"), Id, TEXT("graph has no End node; every conversation must be able to finish"));

		// Edge map for graph analysis.
		TMap<FName, TArray<FName>> Out;
		for (const FMRDialogueNode& N : G->Nodes)
		{
			if (N.NodeId.IsNone()) continue;
			TArray<FName>& O = Out.FindOrAdd(N.NodeId);
			if (N.Type == EMRDialogueNodeType::Line) { if (NodeIds.Contains(N.NextNodeId)) O.Add(N.NextNodeId); }
			else if (N.Type == EMRDialogueNodeType::Choice || N.Type == EMRDialogueNodeType::Branch) for (const FMRDialogueChoice& Ch : N.Choices) if (NodeIds.Contains(Ch.NextNodeId)) O.Add(Ch.NextNodeId);
		}
		if (!NodeIds.Contains(G->StartNodeId)) return;

		TSet<FName> Reach; TArray<FName> Stack; Stack.Add(G->StartNodeId);
		while (Stack.Num()) { const FName N = Stack.Pop(); if (Reach.Contains(N)) continue; Reach.Add(N); if (const TArray<FName>* O = Out.Find(N)) for (FName T : *O) Stack.Add(T); }
		for (const FMRDialogueNode& N : G->Nodes) if (!N.NodeId.IsNone() && !Reach.Contains(N.NodeId)) C.R.Error(TEXT("UNREACHABLE_NODE"), Id, FString::Printf(TEXT("node '%s' cannot be reached from the start node; connect or remove it"), *N.NodeId.ToString()));

		// Every reachable node must be able to reach an End (reverse reachability).
		TSet<FName> CanEnd;
		for (const FMRDialogueNode& N : G->Nodes) if (N.Type == EMRDialogueNodeType::End && !N.NodeId.IsNone()) CanEnd.Add(N.NodeId);
		bool bChanged = true;
		while (bChanged) { bChanged = false; for (const TPair<FName, TArray<FName>>& P : Out) { if (CanEnd.Contains(P.Key)) continue; for (FName T : P.Value) if (CanEnd.Contains(T)) { CanEnd.Add(P.Key); bChanged = true; break; } } }
		for (FName N : Reach) if (!CanEnd.Contains(N)) C.R.Error(TEXT("NON_TERMINATING"), Id, FString::Printf(TEXT("node '%s' can never reach an End node (dead end or endless loop)"), *N.ToString()));

		// Silent loops: a cycle made only of Branch nodes would spin without player input.
		TMap<FName, int32> Color; bool bBranchCycle = false;
		TFunction<void(FName)> Dfs = [&](FName N)
		{
			Color.Add(N, 1);
			const FMRDialogueNode* Node = G->FindNode(N);
			if (Node && Node->Type == EMRDialogueNodeType::Branch)
				for (const FMRDialogueChoice& Ch : Node->Choices)
				{
					const FMRDialogueNode* To = G->FindNode(Ch.NextNodeId); if (!To || To->Type != EMRDialogueNodeType::Branch) continue;
					const int32* Col = Color.Find(Ch.NextNodeId);
					if (Col && *Col == 1) bBranchCycle = true; else if (!Col) Dfs(Ch.NextNodeId);
				}
			Color.Add(N, 2);
		};
		for (FName N : Reach) if (!Color.Contains(N)) Dfs(N);
		if (bBranchCycle) C.R.Error(TEXT("BRANCH_CYCLE"), Id, TEXT("Branch nodes form a loop with no player-facing node in it; the conversation would never wait for input"));
	}
}

namespace MRNarrative
{
	FName DialogueVersionOf(const FMRNarrativeBundle& B)
	{
		for (const UMRDialogueGraph* G : B.Graphs) if (G) return G->ContentVersion;
		for (const UMRNpcRecord* N : B.Npcs) if (N) return N->ContentVersion;
		return NAME_None;
	}
	FName QuestVersionOf(const FMRNarrativeBundle& B) { for (const UMRMissionRecord* M : B.Missions) if (M) return M->ContentVersion; return NAME_None; }

	void ValidateBundle(const FMRNarrativeBundle& B, const FMRValidationPolicy& P, FMRValidationReport& Out, const TFunction<bool(FName, FName)>* StringLookup)
	{
		struct FLookupScope { const TFunction<bool(FName, FName)>* Prev; FLookupScope(const TFunction<bool(FName, FName)>* L) : Prev(GLookup) { GLookup = L; } ~FLookupScope() { GLookup = Prev; } } Scope(StringLookup);
		FCtx C{ B, Out };
		// 1. ids (must exist before cross references are checked)
		auto Collect = [&](const UMRNarrativeRecordBase* Rec, TSet<FName>& Set, const TCHAR* Kind)
		{
			if (!Rec) { Out.Error(TEXT("NULL_RECORD"), FName("bundle"), FString::Printf(TEXT("a null %s entry is in the bundle"), Kind)); return; }
			CheckRecordHeader(C, Rec, Kind, P);
			if (Rec->RecordId.IsNone()) return;
			if (Set.Contains(Rec->RecordId)) Out.Error(TEXT("DUPLICATE_ID"), Rec->RecordId, FString::Printf(TEXT("more than one %s record has id '%s'; ids must be unique"), Kind, *Rec->RecordId.ToString()));
			Set.Add(Rec->RecordId);
		};
		for (const UMRNpcRecord* N : B.Npcs) Collect(N, C.NpcIds, TEXT("NPC"));
		for (const UMRDialogueGraph* G : B.Graphs) Collect(G, C.GraphIds, TEXT("dialogue"));
		for (const UMRMissionRecord* M : B.Missions)
		{
			Collect(M, C.MissionIds, TEXT("mission"));
			if (!M) continue;
			for (const FMRObjectiveDef& O : M->Objectives)
			{
				if (O.ObjectiveId.IsNone()) { Out.Error(TEXT("EMPTY_ID"), M->RecordId, TEXT("an objective has no ObjectiveId")); continue; }
				if (C.ObjectiveIds.Contains(O.ObjectiveId)) Out.Error(TEXT("DUPLICATE_ID"), M->RecordId, TEXT("duplicate ObjectiveId '") + O.ObjectiveId.ToString() + TEXT("'; objective ids must be unique across all missions"));
				C.ObjectiveIds.Add(O.ObjectiveId);
			}
		}

		// 2. NPCs
		for (const UMRNpcRecord* N : B.Npcs)
		{
			if (!N || N->RecordId.IsNone()) continue;
			if (!HasStr(N->StringTableId, N->DisplayNameKey)) Out.Error(TEXT("MISSING_STRING_KEY"), N->RecordId, FString::Printf(TEXT("display-name key '%s' not found in string table '%s'"), *N->DisplayNameKey.ToString(), *N->StringTableId.ToString()));
			if (!N->DefaultDialogueGraphId.IsNone() && !C.GraphIds.Contains(N->DefaultDialogueGraphId)) Out.Error(TEXT("UNKNOWN_GRAPH"), N->RecordId, TEXT("DefaultDialogueGraphId '") + N->DefaultDialogueGraphId.ToString() + TEXT("' is not a dialogue in the bundle"));
		}
		// 3. graphs
		for (const UMRDialogueGraph* G : B.Graphs) if (G) CheckGraph(C, G);
		// 4. missions
		for (const UMRMissionRecord* M : B.Missions)
		{
			if (!M || M->RecordId.IsNone()) continue;
			if (!HasStr(M->StringTableId, M->TitleKey)) Out.Error(TEXT("MISSING_STRING_KEY"), M->RecordId, FString::Printf(TEXT("title key '%s' not found in string table '%s'"), *M->TitleKey.ToString(), *M->StringTableId.ToString()));
			if (!M->SummaryKey.IsNone() && !HasStr(M->StringTableId, M->SummaryKey)) Out.Error(TEXT("MISSING_STRING_KEY"), M->RecordId, TEXT("summary key '") + M->SummaryKey.ToString() + TEXT("' not found"));
			if (!M->OfferingNpcId.IsNone() && !C.NpcIds.Contains(M->OfferingNpcId)) Out.Error(TEXT("UNKNOWN_NPC"), M->RecordId, TEXT("OfferingNpcId '") + M->OfferingNpcId.ToString() + TEXT("' is not an NPC record in the bundle"));
			if (M->Objectives.Num() == 0) Out.Error(TEXT("NO_OBJECTIVES"), M->RecordId, TEXT("a mission needs at least one objective"));
			for (const FMRObjectiveDef& O : M->Objectives)
			{
				if (!HasStr(M->StringTableId, O.TextKey)) Out.Error(TEXT("MISSING_STRING_KEY"), M->RecordId, FString::Printf(TEXT("objective '%s' text key '%s' not found in string table '%s'"), *O.ObjectiveId.ToString(), *O.TextKey.ToString(), *M->StringTableId.ToString()));
				if (O.CompletionEventId.IsNone()) Out.Error(TEXT("BAD_OBJECTIVE"), M->RecordId, FString::Printf(TEXT("objective '%s' has no CompletionEventId"), *O.ObjectiveId.ToString()));
			}
		}
		// 5. versions: one dialogue version (graphs+NPCs), one quest version (missions)
		{
			FName DV = NAME_None;
			auto CheckDV = [&](const UMRNarrativeRecordBase* R) { if (!R || R->ContentVersion.IsNone()) return; if (DV.IsNone()) DV = R->ContentVersion; else if (DV != R->ContentVersion) Out.Error(TEXT("VERSION_MISMATCH"), R->RecordId, FString::Printf(TEXT("ContentVersion '%s' differs from the dialogue set version '%s'; NPCs and dialogue graphs in one bundle must share a version"), *R->ContentVersion.ToString(), *DV.ToString())); };
			for (const UMRNpcRecord* N : B.Npcs) CheckDV(N);
			for (const UMRDialogueGraph* G : B.Graphs) CheckDV(G);
			FName QV = NAME_None;
			for (const UMRMissionRecord* M : B.Missions) { if (!M || M->ContentVersion.IsNone()) continue; if (QV.IsNone()) QV = M->ContentVersion; else if (QV != M->ContentVersion) Out.Error(TEXT("VERSION_MISMATCH"), M->RecordId, FString::Printf(TEXT("ContentVersion '%s' differs from the mission set version '%s'"), *M->ContentVersion.ToString(), *QV.ToString())); }
		}
		// 6. fixture isolation: canonical records must not depend on fixtures (and fixtures must not be mixed into canon)
		auto Leak = [&](const UMRNarrativeRecordBase* From, FName To)
		{
			if (From && !From->bTestFixture && C.FixtureIds.Contains(To)) Out.Error(TEXT("FIXTURE_LEAK"), From->RecordId, TEXT("canonical record references test-fixture record '") + To.ToString() + TEXT("'; canon must never depend on fixtures"));
		};
		for (const UMRNpcRecord* N : B.Npcs) if (N) Leak(N, N->DefaultDialogueGraphId);
		for (const UMRDialogueGraph* G : B.Graphs)
		{
			if (!G) continue; Leak(G, G->NpcId);
			for (const FMRDialogueNode& Nd : G->Nodes)
			{
				Leak(G, Nd.SpeakerNpcId);
				auto LeakFx = [&](const TArray<FMRDialogueEffect>& Fx) { for (const FMRDialogueEffect& E : Fx) if (E.Type == EMREffectType::OfferMission || E.Type == EMREffectType::AcceptMission) Leak(G, E.Subject); };
				LeakFx(Nd.OnEnterEffects); for (const FMRDialogueChoice& Ch : Nd.Choices) LeakFx(Ch.Effects);
			}
		}
		for (const UMRMissionRecord* M : B.Missions) if (M) Leak(M, M->OfferingNpcId);
	}
}
