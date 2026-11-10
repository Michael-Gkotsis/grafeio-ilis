// The table of all command handlers.
//
// Purpose: `HANDLERS`: command type -> handler function. The mapped type makes a missing or misspelled key a compile
//   error.
// Does NOT: run anything itself; `run.ts` calls these.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import type { Command, Handler } from '../types';
import { handleDeclare, handleDeclareMany, handleOuts, handleReplaceStatus } from './declare';
import {
  handleEndStatus,
  handleDeleteStatus,
  handleCancelLeave,
  handleEndLeave,
  handleApprovePun,
  handleSetPunInfo,
  handleSetTimes,
} from './statusEdits';
import { handleSaveRequest, handleDeleteRequest, handleDecideRequest } from './requests';
import {
  handleSaveCadre,
  handleImportCadres,
  handleImportCadreAbs,
  handleOrderCadre,
  handleDeleteCadre,
  handleAddCadreAbs,
  handleDeleteCadreAbs,
} from './cadre';
import {
  handleAssign,
  handleSwapPosts,
  handleAutofillRange,
  handleAutofill,
  handleClearDay,
  handleRemoveDutyLog,
} from './duties';
import {
  handleSetRules,
  handleSetCap,
  handleSetOffDays,
  handleSetSkip,
  handleDelSkip,
  handleSetDutyProfile,
} from './dutyRules';
import { handleSetSettings, handleSetHkRows, handlePrinted } from './settings';
import {
  handleSetPhase,
  handleAddPhase,
  handleRenamePhase,
  handleDelPhase,
  handleAddBlock,
  handleEditBlock,
  handleSetBlock,
} from './phases';
import {
  handleSetNightTraining,
  handleSetWeekRules,
  handleSetDayPlan,
  handleSetDayPlans,
  handleSetBackFix,
  handleDelBackFix,
} from './dayPlans';
import {
  handleUpdatePerson,
  handleAddPerson,
  handleAddPeople,
  handleSetBaseline,
  handleSetBaselines,
  handleSetPersonal,
  handleSetPersonMove,
} from './people';
import {
  handleImportPeople,
  handleImportRecords,
  handleSetPeopleFields,
  handleImportCaps,
  handleImportDuties,
} from './imports';
import { handleNote } from './notes';
import {
  handleSetWeapons,
  handleWeaponOut,
  handleWeaponIn,
  handleEditWeaponMove,
  handleEditWeaponMoves,
  handleDeleteWeaponMove,
  handleFixDutyWeapon,
} from './weapons';
import { handleSetHd, handleSetImer, handleSetHkaiManual, handleSetHkaiLv, handleFreezeHkaiLv } from './hdHkai';
import { handleExtendOpen, handleExpire } from './auto';

/**
 * Every command type and the function that runs it. The mapped type makes a missing or misspelled key a compile error.
 * @see run
 */
export const HANDLERS: { [T in Command['t']]: Handler<T> } = {
  declare: handleDeclare,
  declareMany: handleDeclareMany,
  outs: handleOuts,
  saveCadre: handleSaveCadre,
  importCadres: handleImportCadres,
  importCadreAbs: handleImportCadreAbs,
  orderCadre: handleOrderCadre,
  deleteCadre: handleDeleteCadre,
  addCadreAbs: handleAddCadreAbs,
  deleteCadreAbs: handleDeleteCadreAbs,
  addRequest: handleSaveRequest,
  updateRequest: handleSaveRequest,
  deleteRequest: handleDeleteRequest,
  decideRequest: handleDecideRequest,
  setPersonMove: handleSetPersonMove,
  setPunInfo: handleSetPunInfo,
  setTimes: handleSetTimes,
  endStatus: handleEndStatus,
  deleteStatus: handleDeleteStatus,
  replaceStatus: handleReplaceStatus,
  cancelLeave: handleCancelLeave,
  endLeave: handleEndLeave,
  approvePun: handleApprovePun,
  assign: handleAssign,
  swapPosts: handleSwapPosts,
  autofillRange: handleAutofillRange,
  autofill: handleAutofill,
  clearDay: handleClearDay,
  setRules: handleSetRules,
  setCap: handleSetCap,
  setOffDays: handleSetOffDays,
  setSkip: handleSetSkip,
  delSkip: handleDelSkip,
  setDutyProfile: handleSetDutyProfile,
  setSettings: handleSetSettings,
  setHkRows: handleSetHkRows,
  printed: handlePrinted,
  importPeople: handleImportPeople,
  importRecords: handleImportRecords,
  setPeopleFields: handleSetPeopleFields,
  importCaps: handleImportCaps,
  importDuties: handleImportDuties,
  removeDutyLog: handleRemoveDutyLog,
  setBaselines: handleSetBaselines,
  updatePerson: handleUpdatePerson,
  setPersonal: handleSetPersonal,
  setWeapons: handleSetWeapons,
  weaponOut: handleWeaponOut,
  weaponIn: handleWeaponIn,
  editWeaponMove: handleEditWeaponMove,
  editWeaponMoves: handleEditWeaponMoves,
  deleteWeaponMove: handleDeleteWeaponMove,
  fixDutyWeapon: handleFixDutyWeapon,
  addNote: handleNote,
  editNote: handleNote,
  doneNote: handleNote,
  deleteNote: handleNote,
  addPerson: handleAddPerson,
  addPeople: handleAddPeople,
  setBaseline: handleSetBaseline,
  setHkaiManual: handleSetHkaiManual,
  setHkaiLv: handleSetHkaiLv,
  freezeHkaiLv: handleFreezeHkaiLv,
  setPhase: handleSetPhase,
  addPhase: handleAddPhase,
  renamePhase: handleRenamePhase,
  delPhase: handleDelPhase,
  addBlock: handleAddBlock,
  editBlock: handleEditBlock,
  setBlock: handleSetBlock,
  setNightTraining: handleSetNightTraining,
  setWeekRules: handleSetWeekRules,
  setDayPlan: handleSetDayPlan,
  setHd: handleSetHd,
  setImer: handleSetImer,
  setDayPlans: handleSetDayPlans,
  setBackFix: handleSetBackFix,
  delBackFix: handleDelBackFix,
  extendOpen: handleExtendOpen,
  expire: handleExpire,
};
