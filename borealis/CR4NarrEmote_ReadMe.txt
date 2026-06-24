This document describes the columns in the two principal datasets. All procedures are more fully described in the accompanying paper: 

"CR4-NarrEmote: An Open Vocabulary Dataset of Narrative Emotions Derived Using Citizen Science"

Tables:

CR4NarrEmote_All.csv = the full dataset extracted from Zooniverse
CR4NarrEmote_t1Yes.csv = subsetted by only those annotations where an emotion was labeled

Column Name		Description

file_id			Unique identifier for the document from which passages are drawn
classification_id	Unique ID for each individual annotation
user_id			Anonymized ID of the annotator
workflow_name		Name of the annotation workflow
created_at		Timestamp of when the annotation was submitted
subject_ids		Unique IUD for the text passage being annotated
passage			The text passage shown to annotators
highlighted_char	The character highlighted in the passage
Category		Fiction v. Non-fiction (FIC / NON) - CONLIT only
Genre			More specific genre classification (CONLIT only)
Code			World Literature country code
PUBL_DATE		Publication date of the passage (Worldlit / Conlit)
t0			Task 0 = Is the highlighted word a character? (Yes/No)
t1			Free-text emotion label provided by the annotator
t1_corrected		See cleaning manual for description
t1_unified		See cleaning manual for description
NRC_valence		Valence score from the NRC lexicon (lexical matching)
NRC_arousal		Arousal score from the NRC lexicon (lexical matching)
NRC_dominance		Dominance score from the NRC lexicon (lexical matching)
label_context		Label + Passage used for embedding mapping
NRCBERT_valence		Valence score predicted by a contextual model (e.g., BERT + NRC)
NRCBERT_arousal		Arousal score from the contextual model
NRCBERT_dominance	Dominance score from the contextual model
EMO_valence		Valence from a fully automated emotion model (EmoBank)
EMO_arousal		Arousal from EmoBank
EMO_dominance		Dominance from EmoBank
NRC_emotion		NRC discrete emotion label (e.g., joy, anger) - lexical mapping
NRC_TopEmotion		NRC discrete emotion label BERT embedding mapping - closest neighbor