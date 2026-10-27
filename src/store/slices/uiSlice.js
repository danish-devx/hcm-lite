import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  mobileNavOpen: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setMobileNavOpen(state, action) {
      state.mobileNavOpen = action.payload;
    },
  },
});

export const { setMobileNavOpen } = uiSlice.actions;
export default uiSlice.reducer;
