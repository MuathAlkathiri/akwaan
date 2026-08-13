"use client";

import type { Question } from "@/types";

import { useQuestionForm } from "../hooks/use-question-form";

import { QuestionAudioVideoSection } from "./question-audio-video-section";
import { QuestionClassificationSection } from "./question-classification-section";
import { QuestionContentSection } from "./question-content-section";
import { QuestionFormActions } from "./question-form-actions";
import { QuestionFreeGameField } from "./question-free-game-field";
import { QuestionImageSection } from "./question-image-section";
import { QuestionSettingsSection } from "./question-settings-section";
import { QuestionTop10Section } from "./question-top10-section";
import { BombQuestionEditor } from "./bomb-question-editor";

interface QuestionFormProps {
  question?: Question;
  initialWorldId?: string;
  initialChallengeTypeId?: string;
  onSuccess?: (question: Question) => void;
  onCancel?: () => void;
}

export function QuestionForm({
  question,
  initialWorldId,
  initialChallengeTypeId,
  onSuccess,
  onCancel,
}: QuestionFormProps) {
  const { form, values, state, media, actions } = useQuestionForm({
    question,
    initialClassification: {
      worldId: initialWorldId,
      challengeTypeId: initialChallengeTypeId,
    },
    onSuccess,
    onCancel,
  });

  const handleQuestionSubmit = form.handleSubmit(async (data) => {
    await actions.submit(data);
  });

  const handleSaveDraft = form.handleSubmit(async (data) => {
    await actions.saveDraft(data);
  });
  const pathComplete = Boolean(
    values.categoryId ||
    (values.worldId && values.contentCategoryId && values.challengeTypeId),
  );

  return (
    <form className="space-y-6" onSubmit={handleQuestionSubmit}>
      <QuestionClassificationSection
        categories={state.categories}
        values={values}
        errors={form.errors}
        setValue={form.setValue}
      />

      {!pathComplete && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          اختر العالم وتصنيف المحتوى ونوع التحدي لفتح محرر السؤال.
        </p>
      )}

      {pathComplete && (
        <>
          <QuestionFormActions
            dirty={state.dirty}
            pending={state.pending}
            isEditing={Boolean(question)}
            onCancel={actions.cancel}
            onSaveDraft={handleSaveDraft}
          />

          <QuestionContentSection
            values={values}
            register={form.register}
            errors={form.errors}
            isTop10={state.isTop10}
            isBomb={state.isBomb}
            acceptedAnswers={state.acceptedAnswers}
            onAcceptedAnswersChange={actions.updateAcceptedAnswers}
            onGenerateAliases={actions.generateStandardAliases}
            isGeneratingAliases={state.standardAliasPending}
          />

          {state.isTop10 && (
            <QuestionTop10Section
              entries={state.rankedEntries}
              rowWarnings={state.rowWarnings}
              isGeneratingAliases={state.rankedAliasPending}
              onEntriesChange={actions.updateRankedEntries}
              onGenerateAliases={actions.generateRankedAliases}
            />
          )}

          {state.isBomb && (
            <BombQuestionEditor
              items={state.bombItems}
              onChange={actions.updateBombItems}
              onUpload={actions.uploadBombItemImage}
            />
          )}

          {state.isImage && (
            <QuestionImageSection
              questionId={state.questionId || undefined}
              question={question}
              storedImageUrl={media.storedImageUrl}
              isUploading={media.imageUploading}
              isRemoving={media.imageRemoving}
              onUpload={actions.uploadImage}
              onRemove={actions.removeImage}
            />
          )}

          {state.isMedia && (
            <QuestionAudioVideoSection
              question={question}
              questionId={state.questionId}
              values={values}
              register={form.register}
              errors={form.errors}
              setValue={form.setValue}
              isAudio={state.isAudio}
              isVideo={state.isVideo}
              audioDisabled={state.selectedCategory?.audioPolicy === "disabled"}
              candidates={state.audioCandidates}
              candidatesLoading={state.audioCandidatesLoading}
              actionsPending={media.audioPending}
              storedMediaUrl={media.storedMediaUrl}
              isUploading={media.mediaUploading}
              isRemoving={media.mediaRemoving}
              onRetryResearch={actions.retryMediaResearch}
              onRetryProcessing={actions.retryMediaProcessing}
              onPreview={actions.previewCurrentClip}
              onApprove={actions.approveMedia}
              onReject={actions.rejectMedia}
              onRemove={actions.removeMedia}
              onUpload={actions.uploadMedia}
              onSelectCandidate={actions.selectMediaCandidate}
            />
          )}

          <QuestionSettingsSection
            isTop10={state.isTop10}
            values={values}
            setValue={form.setValue}
          />

          <QuestionFreeGameField register={form.register} />

          {state.generationWarning && (
            <p role="alert" className="text-sm text-amber-300">
              {state.generationWarning}
            </p>
          )}
        </>
      )}
    </form>
  );
}
